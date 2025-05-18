import { BunRuntime } from "@effect/platform-bun";
import { Effect, Match, Schema, Stream } from "effect";
import type { Socket } from "node:net";
import { provideConfigService } from "./config";
import { Resp } from "./schema/resp";
import { acquireSocketStream } from "./server";
import { getSocketDataStream, getSocketWriter } from "./server/socket";

const main = Effect.gen(function* () {
	const socketStream = yield* acquireSocketStream;
	const socketHandlerStream = socketStream.pipe(
		Stream.mapEffect(handleSocket, { concurrency: "unbounded" }),
	);

	return yield* Stream.runDrain(socketHandlerStream);
});

const decodeResp = Schema.decode(Resp.RespData);
const encodeResp = Schema.encode(Resp.RespData);
const decodeRespBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Effect.logInfo("Received", str);
	const decoded = yield* decodeResp(str);
	yield* Effect.logInfo("Decoded", str, "to", decoded);
	return decoded;
});

function handleSocket(s: Socket): Effect.Effect<void, never, never> {
	const write = getSocketWriter(s);
	const dataStream = getSocketDataStream(s);
	return dataStream.pipe(
		Stream.mapEffect(decodeRespBuffer),
		Stream.map(getCommandResponse),
		Stream.mapEffect(encodeResp),
		Stream.mapEffect(write),
		Stream.catchAll((err) => Effect.logError(err)),
		Stream.runDrain,
		Effect.tap(Effect.log("Disconnected")),
	);
}

const getCommandResponse = Match.type<Resp.RespValue>().pipe(
	Match.when(["PING"], () => "PONG"),
	Match.when(["ECHO", Match.string], ([, message]) => message),
	Match.orElse((_value) => new Resp.Error({ message: "Unrecognized command" })),
);

main.pipe(provideConfigService(), Effect.scoped, BunRuntime.runMain);
