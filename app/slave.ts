import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Net } from "$/network";
import { Protocol } from "$/protocol";
import { RDB } from "$/rdb";
import { LeftoverSimpleString } from "$/resp/v2/string/simple";
import { createSocketCommandsHandler, StartServer } from "$/server";
import { Replication } from "./replication";

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

	const { rdb } = yield* performMasterHandshake(socket).pipe(
		Effect.provide(MasterCommandProcessor),
	);
	const kv = yield* KV.KvStorage;
	const syncedKv = yield* KV.rdbToKv(rdb);
	yield* kv.setMany(syncedKv);

	const handler = yield* createSocketCommandsHandler(socket).pipe(
		Effect.provide(MasterCommandProcessor),
	);
	const replication = yield* Replication.Replication;
	yield* Effect.all(
		[
			Net.Socket.handleMessages(socket, (data) =>
				Effect.zip(
					replication.addReplicationOffset(data.length),
					handler(data),
				),
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
	yield* ping(socket);
	yield* port(socket);
	yield* capabilites(socket);
	return yield* psync(socket);
});

const ping = Effect.fn(function* (socket: Net.Socket.Socket) {
	const res = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode(["PING"]),
	);

	const replication = yield* Replication.Replication;
	yield* replication.addReplicationOffset(res.length);

	const message = yield* Protocol.decodeBuffer(res);

	if (message !== "PONG") {
		return yield* Effect.fail(
			new Error(
				`Expected a PONG response from master server. Received ${Protocol.format(message)} instead.`,
			),
		);
	}
});

const port = Effect.fn(function* (socket: Net.Socket.Socket) {
	const config = yield* AppConfig;
	const res = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode([
			"REPLCONF",
			"listening-port",
			config.port.toString(),
		]),
	);
	const replication = yield* Replication.Replication;
	yield* replication.addReplicationOffset(res.length);

	const message = yield* Protocol.decodeBuffer(res);
	if (message !== "OK") {
		return yield* Effect.fail(
			new Error(
				`Expected a OK response from master server. Received ${Protocol.format(message)} instead.`,
			),
		);
	}
});

const capabilites = Effect.fn(function* (socket: Net.Socket.Socket) {
	const res = yield* Net.Socket.request(
		socket,
		yield* Protocol.encode(["REPLCONF", "capa", "psync2"]),
	);
	const replication = yield* Replication.Replication;
	yield* replication.addReplicationOffset(res.length);

	const message = yield* Protocol.decodeBuffer(res);

	if (message !== "OK") {
		return yield* Effect.fail(
			new Error(
				`Expected a OK response from master server. Received ${Protocol.format(message)} instead.`,
			),
		);
	}
});

const psync = Effect.fn(function* (socket: Net.Socket.Socket) {
	const messages = {
		fsync: Option.none<string>(),
		rdb: Option.none<RDB.RDB>(),
	};
	const commandHandler = yield* createSocketCommandsHandler(socket);

	const replication = yield* Replication.Replication;
	const messagesFiber = yield* Net.Socket.handleMessages(
		socket,
		function (data, interrupt) {
			return Effect.gen(function* () {
				yield* replication.addReplicationOffset(data.length);

				if (Option.isNone(messages.fsync)) {
					const [_, fsync] = yield* Schema.decodeUnknown(LeftoverSimpleString)(
						data.toString("ascii"),
					);

					messages.fsync = Option.some(fsync.data);
					if (fsync.leftover === "") {
						return;
					}

					data = data.subarray(-fsync.leftover.length);
				}

				const rdb = yield* RDB.decodeNetworkBuffer(data);
				messages.rdb = Option.some(rdb.rdb);
				if (rdb.rest.length !== 0) {
					yield* commandHandler(rdb.rest);
				}

				interrupt();
			}).pipe(
				Effect.tapError(Effect.logFatal),
				Effect.catchAll(() => Effect.succeed(interrupt())),
			);
		},
	).pipe(Effect.fork);

	yield* Net.Socket.write(socket, yield* Protocol.encode(["PSYNC", "?", "-1"]));
	yield* messagesFiber;

	const { fsync, rdb } = messages;
	if (Option.isNone(fsync)) {
		return yield* Effect.die(new Error("Expected fsync to exist"));
	}
	if (Option.isNone(rdb)) {
		return yield* Effect.die(new Error("Expected rdb to exist"));
	}

	yield* Effect.log(fsync.value);
	yield* Effect.log(RDB.format(rdb.value));

	return { rdb: rdb.value };
});
