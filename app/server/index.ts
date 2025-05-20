import { Config } from "$/config";
import { Effect, Stream, flow } from "effect";
import { type Server, createServer } from "node:net";
import { type SocketResource, acquireSocketResource } from "./socket";

const acquireServer = Effect.gen(function* () {
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

export const acquireSocketResourceStream = Effect.gen(function* () {
	const server = yield* acquireServer;
	return Stream.async<SocketResource>((emit) => {
		const handler = flow(acquireSocketResource, (x) => emit.single(x));
		server.on("connection", handler);

		return Effect.sync(() => {
			server.off("connection", handler);
		});
	});
});
