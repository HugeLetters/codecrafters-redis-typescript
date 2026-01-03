import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { Net } from "$/network";
import { Protocol } from "$/protocol";
import { Integer } from "$/schema/number";
import { JobQueue } from "$/utils/job-queue";
import { Log } from "$/utils/log";
import { normalize } from "$/utils/string";

export const StartMaster = Effect.gen(function* () {
	const config = yield* AppConfig;
	const server = yield* Net.Server.start({
		host: config.host,
		port: config.port,
	});
	yield* Log.logInfo("Listening", { HOST: config.host, PORT: config.port });

	return yield* Net.Server.handleConnections(server, handleConnection);
});

const encodeResponse = Effect.fn(function* (input: Protocol.Value) {
	const encoded = yield* Protocol.encode(input);
	yield* Log.logInfo("Encoded", { data: normalize(encoded) });
	return encoded;
}, Log.withSpan("encode"));

const decodeBuffer = Effect.fn(function* (buffer: Buffer) {
	const decoded = yield* Protocol.decodeBuffer(buffer);
	yield* Log.logInfo("Decoded", { data: Protocol.format(decoded) });
	return decoded;
}, Log.withSpan("decode"));

const handleConnection = Effect.fn(function* (socket: Net.Socket.Socket) {
	yield* Effect.logInfo("Connection opened");

	const command = yield* Command.Processor;

	const SendFallbackError = Protocol.fail("Internal Error").pipe(
		Protocol.encode,
		Effect.flatMap((data) => Net.Socket.write(socket, data)),
		Effect.catchTag("ParseError", (error) => {
			return Log.logError("Failed to send a default error", {
				error: error.message,
			});
		}),
	);

	const onMessage = flow(
		command.process,
		Effect.catchTag("RespError", (error) => Effect.succeed(error)),
		Effect.flatMap(encodeResponse),
		Effect.flatMap((data) => {
			return Net.Socket.write(socket, data);
		}),
		Effect.catchTag("ParseError", (error) => {
			return Log.logError("Invalid Response", { error: error.message }).pipe(
				Effect.andThen(SendFallbackError),
			);
		}),
		Effect.catchTag("SocketWrite", (error) => {
			return Log.logError("Socket write failed", { error: error.message });
		}),
		Log.withSpan("message"),
	);

	type Context = Effect.Effect.Context<ReturnType<typeof onMessage>>;
	const messageQueue = yield* JobQueue.make<Context>(Integer.make(1));

	const enqueueMessage = flow(
		decodeBuffer,
		Effect.flatMap(flow(onMessage, (job) => JobQueue.offer(messageQueue, job))),
		Effect.catchTag("ParseError", (error) =>
			Log.logError("Invalid message", { error: error.message }),
		),
	);

	yield* Net.Socket.handleMessages(socket, enqueueMessage);
	yield* Effect.logInfo("Connection closed");
});
