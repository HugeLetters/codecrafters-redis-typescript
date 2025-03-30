import { Console, Effect, flow } from "effect";
import { createServer, type Socket } from "node:net";
import { Config } from "./config";

const startServer = Effect.gen(function* () {
	const config = yield* Config;

	return yield* Effect.async(function (resume) {
		const server = createServer(async (c) => {
			const message = await Effect.runPromise<string, never>(getResponse(c));
			c.end(message);
		});

		server.listen(config.PORT, config.HOST).on("listening", () => {
			const message = `Server is listening on ${config.HOST}:${config.PORT}`;
			Effect.succeed(null).pipe(Effect.tap(Console.log(message)), resume);
		});

		return Effect.async((resume) => {
			server.close(flow(Effect.succeed, resume));
		});
	});
});

startServer.pipe(Effect.runPromise);

function getResponse(c: Socket) {
	return Effect.succeed("PONG\r\n");
}
