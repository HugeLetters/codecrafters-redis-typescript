import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { Net } from "$/network";
import { Protocol } from "$/protocol";
import { StartServer } from "$/server";
import { Integer } from "./schema/number";

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

	yield* performMasterHandshake(socket);

	const HandleMasterMessages = Net.Socket.handleMessages(socket, (d) =>
		Protocol.decode(d.toString()).pipe(
			Effect.catchAll(Effect.logError),
			Effect.tap(Effect.log),
		),
	);

	yield* Effect.all(
		[
			HandleMasterMessages,
			StartServer.pipe(Effect.provide(SlaveCommandProcessor)),
		],
		{ concurrency: "unbounded" },
	);
});

const SlaveCommandProcessor = Command.Processor.Default.pipe(
	Layer.provide(Command.ExecutorSlave),
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
				`Expected a OK response from master server. Received ${Protocol.format(pong)} instead.`,
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
				`Expected a OK response from master server. Received ${Protocol.format(pong)} instead.`,
			),
		);
	}

	yield* Net.Socket.write(
		socket,
		yield* Protocol.encode(["PSYNC", "?", Integer.make(-1)]),
	);
});
