import { Config } from "$/config";
import { Console, Effect, type Scope, Stream, flow } from "effect";
import { type Server, type Socket, createServer } from "node:net";
import { acquireSocket } from "./socket";

const acquireServer = Effect.gen(function* () {
	const config = yield* Config;

	const server = Effect.async<Server>(function (resume) {
		const server = createServer().listen(
			{ host: config.HOST, port: config.PORT },
			() => {
				const message = `Server is listening on ${config.HOST}:${config.PORT}`;
				Effect.succeed(server).pipe(Effect.tap(Console.log(message)), resume);
			},
		);
	});

	return yield* Effect.acquireRelease(server, (s) =>
		Effect.async((resume) => {
			const closeLog = Console.log("Server closed");
			s.close(() => Effect.void.pipe(Effect.tap(closeLog), resume));
		}),
	);
});

export const acquireSocketStream = Effect.gen(function* () {
	const server = yield* acquireServer;
	return Stream.async<Socket, never, Scope.Scope>((emit) => {
		const handler = flow(acquireSocket, (x) => emit.fromEffect(x));
		server.on("connection", handler);

		return Effect.sync(() => {
			server.off("connection", handler);
		});
	});
});
