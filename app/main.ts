import { provideConfigService } from "$/config";
import { Resp } from "$/schema/resp";
import { runSocketHandler } from "$/server";
import {
	type Socket,
	runSocketDataHandler,
	writeToSocket,
} from "$/server/socket";
import { normalize } from "$/utils/string";
import { BunRuntime } from "@effect/platform-bun";
import { Effect, Match, Queue, Schema, flow } from "effect";

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
	const dataQueue = yield* Queue.bounded<Resp.RespValue>(1);
	const enqueueMessage = flow(
		decodeRespBuffer,
		Effect.flatMap((data) => Queue.offer(dataQueue, data)),
		Effect.catchTag("ParseError", (e) =>
			Effect.logError("Received invalid message", e.message),
		),
	);

	const messageTask = Effect.gen(function* () {
		const write = writeToSocket.bind(null, socket);
		while (true) {
			yield* Queue.take(dataQueue).pipe(
				Effect.map(getCommandResponse),
				Effect.flatMap(encodeResp),
				Effect.flatMap(write),
				Effect.catchTags({
					ParseError(e) {
						return Effect.logError("Sent invalid message", e.message);
					},
					SocketWrite(e) {
						return Effect.logError("Could not write to socket", e.message);
					},
				}),
			);
		}
	});

	yield* messageTask.pipe(Effect.fork);
	yield* runSocketDataHandler(socket, enqueueMessage);
});

const getCommandResponse = Match.type<Resp.RespValue>().pipe(
	Match.when(["PING"], () => "PONG"),
	Match.when(["ECHO", Match.string], ([, message]) => message),
	Match.orElse((_value) => new Resp.Error({ message: "Unrecognized command" })),
);

main.pipe(provideConfigService(), Effect.scoped, BunRuntime.runMain);
