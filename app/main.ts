import { BunRuntime } from "@effect/platform-bun";
import { Effect, Stream } from "effect";
import { provideConfigService } from "./config";
import { acquireSocketStream } from "./server";
import { getSocketDataStream, getSocketWriter } from "./server/socket";

const main = Effect.gen(function* () {
	const socketStream = yield* acquireSocketStream;
	const socketHandlerStream = socketStream.pipe(
		Stream.mapEffect(
			(c) => {
				const write = getSocketWriter(c);
				const dataStream = getSocketDataStream(c);
				return dataStream.pipe(
					Stream.map((b) => b.toString("utf8")),
					Stream.tap((data) => Effect.log("Received", data)),
					Stream.mapEffect((_data) => write("+PONG\r\n")),
					Stream.catchTag("SocketWrite", () => Effect.void),
					Stream.runDrain,
					Effect.tap(Effect.log("Disconnected")),
				);
			},
			{ concurrency: "unbounded" },
		),
	);

	return yield* Stream.runDrain(socketHandlerStream);
});

main.pipe(provideConfigService(), Effect.scoped, BunRuntime.runMain);
