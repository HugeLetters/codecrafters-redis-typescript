import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Effect, flow, Layer, Schema } from "effect";
import { Command } from "$/command";
import { KV } from "$/kv";
import { Integer } from "$/schema/number";
import { Resp } from "$/schema/resp";
import { runSocketHandler } from "$/server";
import {
	runSocketDataHandler,
	type Socket,
	writeToSocket,
} from "$/server/socket";
import { JobQueue } from "$/utils/job-queue";
import { Logger } from "$/utils/logger";
import { normalize } from "$/utils/string";
import { RuntimeConfig } from "./config";

const main = Effect.gen(function* () {
	return yield* runSocketHandler(handleSocket);
});

const encodeResp = Schema.encode(Resp.RespValue);
const encodeRespValue = Effect.fn(function* (input: Resp.RespValue) {
	yield* Logger.logInfo("Received", { data: Resp.format(input) });

	const encoded = yield* encodeResp(input);
	yield* Logger.logInfo("Encoded", { data: normalize(encoded) });

	return encoded;
}, Logger.withSpan("resp.encode"));

const decodeResp = Schema.decode(Resp.RespValue);
const decodeRespBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Logger.logInfo("Received", { data: normalize(str) });

	const decoded = yield* decodeResp(str);
	yield* Logger.logInfo("Decoded", { data: Resp.format(decoded) });

	return decoded;
}, Logger.withSpan("resp.decode"));

const handleSocket = Effect.fn(function* (socket: Socket) {
	const messageQueue = yield* JobQueue.make(Integer.make(1));
	const command = yield* Command.CommandProcessor;
	const handleCommand = flow(
		command.process,
		Effect.catchTag("RespError", (error) => Effect.succeed(error)),
		Effect.flatMap(encodeRespValue),
		Effect.flatMap((data) => writeToSocket(socket, data)),
		Effect.catchTags({
			ParseError(error) {
				return Logger.logError("Invalid Response", { error: error.message });
			},
			SocketWrite(error) {
				return Logger.logError("Socket write failed", { error: error.message });
			},
		}),
		Logger.withSpan("command"),
	);

	const enqueueMessage = flow(
		decodeRespBuffer,
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
const CommandProcessorLive = Command.CommandProcessor.Default.pipe(
	Layer.provide([KV.Default, RuntimeConfig.Default]),
);

main.pipe(
	Effect.provide([CommandProcessorLive, DevToolsLive]),
	Effect.scoped,
	BunRuntime.runMain,
);
