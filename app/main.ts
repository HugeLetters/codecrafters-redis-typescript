import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import { flow } from "effect/Function";
import * as Layer from "effect/Layer";
import { Command } from "$/command";
import { AppConfig } from "$/config";
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
import { argvConfigProvider } from "./utils/config/argv";

const main = Effect.gen(function* () {
	return yield* runSocketHandler(handleSocket);
});

const encodeResponse = Effect.fn(function* (input: Protocol.Value) {
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

	type Context = Effect.Effect.Context<ReturnType<typeof handleCommand>>;
	const messageQueue = yield* JobQueue.make<Context>(Integer.make(1));

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

main.pipe(
	Effect.provide([Command.Processor.Default, AppConfig.Default, DevToolsLive]),
	Effect.withConfigProvider(argvConfigProvider()),
	Protocol.config({
		// codecrafters seems to pretty much always expect a bulk string
		shouldTrySimpleStringEncode: Fn.constFalse,
	}),
	Effect.scoped,
	BunRuntime.runMain,
);
