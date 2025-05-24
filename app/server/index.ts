import { Config } from "$/config";
import { Effect, FiberSet, type Scope, flow } from "effect";
import { type Server, createServer } from "node:net";
import { type Socket, createSocketResource } from "./socket";

const serverResource = Effect.gen(function* () {
	const config = yield* Config;

	const server = Effect.async<Server>(function (resume) {
		const server = createServer().listen(
			{ host: config.HOST, port: config.PORT },
			() => {
				const message = `Server is listening on ${config.HOST}:${config.PORT}`;
				Effect.succeed(server).pipe(Effect.tap(Effect.log(message)), resume);
			},
		);
	});

	return yield* Effect.acquireRelease(server, (s) =>
		Effect.async<void>((resume) => {
			const closeLog = Effect.log("Server closed");
			s.close(() => Effect.void.pipe(Effect.tap(closeLog), resume));
		}),
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
			Effect.scoped,
			run,
		);

		server.on("connection", onConnection);
		return Effect.sync(() => {
			server.off("connection", onConnection);
		});
	});
});
