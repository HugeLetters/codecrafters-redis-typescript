import { ConfigLive } from "$/config";
import { Integer } from "$/schema/number";
import { Resp } from "$/schema/resp";
import { runSocketHandler } from "$/server";
import {
	type Socket,
	runSocketDataHandler,
	writeToSocket,
} from "$/server/socket";
import { JobQueue } from "$/utils/job-queue";
import { Logger } from "$/utils/logger";
import { normalize } from "$/utils/string";
import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Effect, Layer, Match, Schema, flow } from "effect";

const main = Effect.gen(function* () {
	yield* runSocketHandler(handleSocket);
});

const encodeResp = Schema.encode(Resp.RespValue);
const encodeRespValue = Effect.fn(function* (input: Resp.RespValue) {
	yield* Logger.logInfo("Received", { data: Resp.format(input) });

	const encoded = yield* encodeResp(input);
	yield* Logger.logInfo("Encoded", { data: normalize(encoded) });

	return encoded;
}, Effect.withSpan("resp.encode"));

const decodeResp = Schema.decode(Resp.RespValue);
const decodeRespBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Logger.logInfo("Received", { data: normalize(str) });

	const decoded = yield* decodeResp(str);
	yield* Logger.logInfo("Decoded", { data: Resp.format(decoded) });

	return decoded;
}, Effect.withSpan("resp.decode"));

const handleSocket = Effect.fn(function* (socket: Socket) {
	const messageQueue = yield* JobQueue.make(Integer.make(1));
	const handleCommand = flow(
		getCommandResponse,
		encodeRespValue,
		Effect.flatMap((data) => writeToSocket(socket, data)),
		Effect.catchTags({
			ParseError(error) {
				return Logger.logError("Sent invalid message", { error });
			},
			SocketWrite(error) {
				return Logger.logError("Could not write to socket", { error });
			},
		}),
		Effect.withSpan("resp.command"),
	);

	const enqueueMessage = flow(
		decodeRespBuffer,
		Effect.flatMap(
			flow(handleCommand, (job) => JobQueue.offer(messageQueue, job)),
		),
		Effect.catchTag("ParseError", (error) =>
			Logger.logError("Received invalid message", { error }),
		),
		Effect.withSpan("socket.message"),
	);

	yield* runSocketDataHandler(socket, enqueueMessage);
});

const getCommandResponse = Match.type<Resp.RespValue>().pipe(
	Match.when(["PING"], () => "PONG"),
	Match.when(["ECHO", Match.string], ([, message]) => message),
	Match.orElse((_value) => new Resp.Error({ message: "Unrecognized command" })),
);

const DevToolsLive = DevTools.layerWebSocket().pipe(
	Layer.provide(BunSocket.layerWebSocketConstructor),
);

main.pipe(
	Effect.provide([ConfigLive(), DevToolsLive]),
	Effect.scoped,
	BunRuntime.runMain,
);
