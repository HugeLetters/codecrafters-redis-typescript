import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Stream } from "effect";
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
					Stream.map((b) => b.toString()),
					Stream.tap((data) => Console.log("Received", data)),
					Stream.mapEffect((_data) => write("+PONG\r\n")),
					Stream.catchTag("SocketWrite", () => Effect.void),
					Stream.runDrain,
					Effect.tap(Console.log("Disconnected")),
				);
			},
			{ concurrency: "unbounded" },
		),
	);

	return yield* Stream.runDrain(socketHandlerStream);
});

main.pipe(Effect.scoped, BunRuntime.runMain);
