import { Config } from "$/config";
import { logDefect } from "$/utils/defect";
import type { ReleaseEffect } from "$/utils/effect";
import { Effect, FiberSet, type Scope, flow } from "effect";
import { type Server, createServer } from "node:net";
import { type Socket, createSocketResource } from "./socket";

interface ServerClient extends ReleaseEffect {
	server: Server;
}

const serverResource = Effect.gen(function* () {
	const config = yield* Config;

	const server = Effect.async<ServerClient>(function (resume) {
		const server = createServer().listen(
			{ host: config.HOST, port: config.PORT },
			() => {
				resume(Effect.succeed({ server, release }));
			},
		);

		const release = Effect.async<void>((resume) => {
			server.close(() => resume(Effect.void));
		}).pipe(Effect.tap(Effect.logInfo("Server closed")));

		return release;
	}).pipe(
		Effect.tap(Effect.logInfo("Server is listening")),
		Effect.annotateLogs("URL", `${config.HOST}:${config.PORT}`),
	);

	return yield* server.pipe(
		Effect.acquireRelease((c) => c.release),
		Effect.map((c) => c.server),
	);
});

export const runSocketHandler = Effect.fn(function* (
	handler: (socket: Socket) => Effect.Effect<void, never, Scope.Scope>,
) {
	const server = yield* serverResource;
	const run = yield* FiberSet.makeRuntime<never, void, never>();
	return yield* Effect.async<never>(() => {
		const onConnection = flow(
			createSocketResource,
			Effect.flatMap(handler),
			logDefect,
			Effect.withSpan("socket"),
			Effect.scoped,
			run,
		);

		server.on("connection", onConnection);
		return Effect.sync(() => {
			server.off("connection", onConnection);
		});
	});
});
