import { BunRuntime } from "@effect/platform-bun";
import { Effect, Match, Schema, Stream } from "effect";
import { provideConfigService } from "./config";
import { Resp } from "./schema/resp";
import { acquireSocketResourceStream } from "./server";
import {
	type SocketResource,
	getSocketDataStream,
	getSocketWriter,
} from "./server/socket";

const main = Effect.gen(function* () {
	const socketStream = yield* acquireSocketResourceStream;
	const socketHandlerStream = socketStream.pipe(
		Stream.mapEffect(handleSocketResource, { concurrency: "unbounded" }),
	);

	yield* Stream.runDrain(socketHandlerStream);
});

const decodeResp = Schema.decode(Resp.RespValue);
const encodeResp = Schema.encode(Resp.RespValue);
const decodeRespBuffer = Effect.fn(function* (buffer: Buffer) {
	const str = buffer.toString("utf8");
	yield* Effect.logInfo("Received", str);
	const decoded = yield* decodeResp(str);
	yield* Effect.logInfo("Decoded", str, "to", decoded);
	return decoded;
});

const handleSocketResource = Effect.fn(function* (resource: SocketResource) {
	const socket = yield* resource;
	const write = getSocketWriter(socket);
	const dataStream = getSocketDataStream(socket);
	return yield* dataStream.pipe(
		Stream.mapEffect(decodeRespBuffer),
		Stream.map(getCommandResponse),
		Stream.mapEffect(encodeResp),
		Stream.mapEffect(write),
		Stream.catchAll((err) => Effect.logError(err)),
		Stream.runDrain,
	);
}, Effect.scoped);

const getCommandResponse = Match.type<Resp.RespValue>().pipe(
	Match.when(["PING"], () => "PONG"),
	Match.when(["ECHO", Match.string], ([, message]) => message),
	Match.orElse((_value) => new Resp.Error({ message: "Unrecognized command" })),
);

main.pipe(provideConfigService(), Effect.scoped, BunRuntime.runMain);
