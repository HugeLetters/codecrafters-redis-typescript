import { createServer, type Server } from "node:net";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import type * as Scope from "effect/Scope";
import { AppConfig } from "$/config";
import { logDefect } from "$/utils/defect";
import { Logger } from "$/utils/logger";
import { createSocketResource, type Socket } from "./socket";

const ServerResource = Effect.gen(function* () {
	const config = yield* AppConfig;

	const server = Effect.async<Server>(function (resume) {
		const server = createServer().listen(
			{ host: config.host, port: config.port },
			() => {
				resume(Effect.succeed(server));
			},
		);

		return Effect.async<void>((resume) => {
			server.close(() => resume(Logger.logInfo("Interrupted")));
		});
	}).pipe(
		Logger.logInfo.tap("Listening", { URL: `${config.host}:${config.port}` }),
	);

	return yield* server.pipe(
		Effect.acquireRelease((server) => {
			return Effect.async<void>((resume) => {
				server.close(() => resume(Logger.logInfo("Closed")));
			});
		}),
	);
}).pipe(Logger.withSpan("server"));

export const runSocketHandler = Effect.fn(function* <R>(
	handler: (socket: Socket) => Effect.Effect<void, never, Scope.Scope | R>,
) {
	const server = yield* ServerResource;
	const run = yield* FiberSet.makeRuntime<R, void, never>();
	return yield* Effect.async<never>(() => {
		const onConnection = Fn.flow(
			createSocketResource,
			Effect.flatMap(handler),
			Effect.catchTag("SocketConnection", (e) =>
				Effect.logError("Provided socket is not able to connect", e),
			),
			logDefect,
			Effect.withSpan("socket.connection"),
			Effect.scoped,
			run,
		);

		server.on("connection", onConnection);
		return Effect.sync(() => {
			server.off("connection", onConnection);
		});
	});
});
