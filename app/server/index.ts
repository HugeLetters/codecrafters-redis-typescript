import { createServer, type Server } from "node:net";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import type * as Scope from "effect/Scope";
import { Config } from "$/server/config";
import { logDefect } from "$/utils/defect";
import { Logger } from "$/utils/logger";
import { createSocketResource, type Socket } from "./socket";

const serverResource = Effect.gen(function* () {
	const config = yield* Config;

	const server = Effect.async<Server>(function (resume) {
		const server = createServer().listen(
			{ host: config.HOST, port: config.PORT },
			() => {
				resume(Effect.succeed(server));
			},
		);

		return Effect.async<void>((resume) => {
			server.close(() => resume(Logger.logInfo("Interrupted")));
		});
	}).pipe(
		Logger.logInfo.tap("Listening", { URL: `${config.HOST}:${config.PORT}` }),
	);

	return yield* server.pipe(
		Effect.acquireRelease((server) => {
			return Effect.async<void>((resume) => {
				server.close(() => resume(Logger.logInfo("Closed")));
			});
		}),
	);
}).pipe(Logger.withSpan("server"));

export const runSocketHandler = Effect.fn(function* <R = never>(
	handler: (socket: Socket) => Effect.Effect<void, never, Scope.Scope | R>,
) {
	const server = yield* serverResource;
	const run = yield* FiberSet.makeRuntime<R, void, never>();
	return yield* Effect.async<never>(() => {
		const onConnection = Fn.flow(
			createSocketResource,
			Effect.flatMap(handler),
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
