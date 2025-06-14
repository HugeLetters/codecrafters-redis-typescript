import { ConfigLive } from "$/config";
import { Resp } from "$/schema/resp";
import { runSocketHandler } from "$/server";
import {
	type Socket,
	runSocketDataHandler,
	writeToSocket,
} from "$/server/socket";
import { JobQueue } from "$/utils/job-queue";
import { normalize } from "$/utils/string";
import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Effect, Layer, Match, Schema, flow } from "effect";
import { Integer } from "./schema/number";

const main = Effect.gen(function* () {
	yield* runSocketHandler(handleSocket);
});

const decodeResp = Schema.decode(Resp.RespValue);
const encodeResp = Schema.encode(Resp.RespValue);
const decodeRespBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Effect.logInfo("Received", normalize(str));
	const decoded = yield* decodeResp(str);
	yield* Effect.logInfo("Decoded", Resp.format(decoded));
	return decoded;
});

const handleSocket = Effect.fn(function* (socket: Socket) {
	const messageQueue = yield* JobQueue.make(Integer.make(1));
	const handleCommand = flow(
		getCommandResponse,
		encodeResp,
		Effect.flatMap((data) => writeToSocket(socket, data)),
		Effect.catchTags({
			ParseError(e) {
				return Effect.logError("Sent invalid message", e.message);
			},
			SocketWrite(e) {
				return Effect.logError("Could not write to socket", e.message);
			},
		}),
	);

	const enqueueMessage = flow(
		decodeRespBuffer,
		Effect.flatMap(
			flow(handleCommand, (job) => JobQueue.offer(messageQueue, job)),
		),
		Effect.catchTag("ParseError", (e) =>
			Effect.logError("Received invalid message", e.message),
		),
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
