import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Net } from "$/network";
import { Protocol } from "$/protocol";
import { RDB } from "$/rdb";
import { handleConnection, StartServer } from "$/server";

export const StartSlave = Effect.gen(function* () {
	const config = yield* AppConfig;
	if (Option.isNone(config.replicaof)) {
		return yield* Effect.fail(
			new Error("Cannot start a slave server without replicaof option"),
		);
	}

	const replicaof = config.replicaof.value;
	const socket = yield* Net.Socket.start({
		host: replicaof.host,
		port: replicaof.port,
	}).pipe(Effect.retry(ConnectionRetryPolicy));

	const { rdb } = yield* performMasterHandshake(socket);
	const kv = yield* KV.KvStorage;
	const syncedKv = yield* KV.rdbToKv(rdb);
	yield* kv.setMany(syncedKv);

	yield* Effect.all(
		[
			handleConnection(socket).pipe(
				Effect.andThen(
					Effect.zip(
						Effect.logWarning("Master connection ended. Shutting down replica"),
						Effect.interrupt,
						{ concurrent: true },
					),
				),
				Effect.provide(MasterCommandProcessor),
			),
			StartServer.pipe(Effect.provide(SlaveCommandProcessor)),
		],
		{ concurrency: "unbounded" },
	);
});

const SlaveCommandProcessor = Command.Processor.Default.pipe(
	Layer.provide(Command.ExecutorSlave),
);
const MasterCommandProcessor = Command.Processor.Default.pipe(
	Layer.provide(Command.Executor.Default),
);

const ConnectionRetryPolicy = Schedule.spaced(Duration.seconds(1)).pipe(
	Schedule.intersect(Schedule.recurs(3)),
);

const performMasterHandshake = Effect.fn(function* (socket: Net.Socket.Socket) {
	const pong = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode(["PING"]),
	).pipe(Effect.flatMap(Protocol.decodeBuffer));

	if (pong !== "PONG") {
		return yield* Effect.fail(
			new Error(
				`Expected a PONG response from master server. Received ${Protocol.format(pong)} instead.`,
			),
		);
	}

	const config = yield* AppConfig;
	const portOk = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode([
			"REPLCONF",
			"listening-port",
			config.port.toString(),
		]),
	).pipe(Effect.flatMap(Protocol.decodeBuffer));

	if (portOk !== "OK") {
		return yield* Effect.fail(
			new Error(
				`Expected a OK response from master server. Received ${Protocol.format(portOk)} instead.`,
			),
		);
	}

	const psyncOk = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode(["REPLCONF", "capa", "psync2"]),
	).pipe(Effect.flatMap(Protocol.decodeBuffer));

	if (psyncOk !== "OK") {
		return yield* Effect.fail(
			new Error(
				`Expected a OK response from master server. Received ${Protocol.format(psyncOk)} instead.`,
			),
		);
	}

	const fsyncBuf = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode(["PSYNC", "?", "-1"]),
	);
	const rdbBuf = yield* Net.Socket.waitForMessage(socket);

	yield* Protocol.decodeBuffer(fsyncBuf);
	const rdb = yield* RDB.decodeNetworkBuffer(rdbBuf);

	return { rdb };
});
