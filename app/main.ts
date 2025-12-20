import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import * as Layer from "effect/Layer";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Protocol } from "$/protocol";
import { Integer } from "$/schema/number";
import { runSocketHandler } from "$/server";
import {
	runSocketDataHandler,
	type Socket,
	writeToSocket,
} from "$/server/socket";
import { JobQueue } from "$/utils/job-queue";
import { Logger } from "$/utils/logger";
import { normalize } from "$/utils/string";

const main = Effect.gen(function* () {
	return yield* runSocketHandler(handleSocket);
});

const encodeResponse = Effect.fn(function* (input: Protocol.Decoded) {
	yield* Logger.logInfo("Received", { data: Protocol.format(input) });

	const encoded = yield* Protocol.encode(input);
	yield* Logger.logInfo("Encoded", { data: normalize(encoded) });

	return encoded;
}, Logger.withSpan("resp.encode"));

const decodeBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Logger.logInfo("Received", { data: normalize(str) });

	const decoded = yield* Protocol.decode(str);
	yield* Logger.logInfo("Decoded", { data: Protocol.format(decoded) });

	return decoded;
}, Logger.withSpan("resp.decode"));

const handleSocket = Effect.fn(function* (socket: Socket) {
	const messageQueue = yield* JobQueue.make(Integer.make(1));
	const command = yield* Command.Processor;
	const handleCommand = flow(
		command.process,
		Effect.catchTag("RespError", (error) => Effect.succeed(error)),
		Effect.flatMap(encodeResponse),
		Effect.catchTag("ParseError", (error) => {
			return Logger.logError("Invalid Response", { error: error.message }).pipe(
				Effect.andThen(Protocol.encode(Protocol.fail("Internal Error"))),
			);
		}),
		Effect.flatMap((data) => writeToSocket(socket, data)),
		Effect.catchTags({
			ParseError(error) {
				return Logger.logFatal("Failed to send a default error", {
					error: error.message,
				});
			},
			SocketWrite(error) {
				return Logger.logError("Socket write failed", { error: error.message });
			},
		}),
		Logger.withSpan("command"),
	);

	const enqueueMessage = flow(
		decodeBuffer,
		Effect.flatMap(
			flow(handleCommand, (job) => JobQueue.offer(messageQueue, job)),
		),
		Effect.catchTag("ParseError", (error) =>
			Logger.logError("Invalid message", { error: error.message }),
		),
		Logger.withSpan("socket.message"),
	);

	yield* runSocketDataHandler(socket, enqueueMessage);
});

const DevToolsLive = DevTools.layerWebSocket().pipe(
	Layer.provide(BunSocket.layerWebSocketConstructor),
);
const CommandProcessorLive = Command.Processor.Default.pipe(
	Layer.provide(KV.KvStorage.Default),
	Layer.provide([AppConfig.Default, BunContext.layer]),
);

main.pipe(
	Effect.provide([CommandProcessorLive, DevToolsLive]),
	Effect.scoped,
	BunRuntime.runMain,
);
