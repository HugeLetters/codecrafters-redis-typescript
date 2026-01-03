import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { AppConfig } from "$/config";
import { Net } from "$/network";
import { Protocol } from "$/protocol";

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

	yield* Net.Socket.handleMessages(socket, (d) =>
		Protocol.decode(d.toString()).pipe(
			Effect.catchAll(Effect.logError),
			Effect.tap(Effect.log),
		),
	);
});

const ConnectionRetryPolicy = Schedule.spaced(Duration.seconds(1)).pipe(
	Schedule.intersect(Schedule.recurs(3)),
);

const performMasterHandshake = Effect.fn(function* (socket: Net.Socket.Socket) {
	yield* Net.Socket.write(socket, yield* Protocol.encode(["PING"]));
	const pong = yield* Net.Socket.waitForMessage(socket).pipe(
		Effect.flatMap(Protocol.decodeBuffer),
	);

	if (pong !== "PONG") {
		return yield* Effect.fail(
			new Error(
				`Expected a PONG response from master server. Received ${Protocol.format(pong)} instead.`,
			),
		);
	}
});
