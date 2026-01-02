import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { AppConfig } from "$/config";
import { Net } from "$/network";
import { Protocol } from "$/protocol";

export const StartSlave = Effect.gen(function* () {
	yield* Effect.sleep(200);

	const config = yield* AppConfig;
	const socket = yield* Net.Socket.start({
		host: config.host,
		port: config.port,
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
});
