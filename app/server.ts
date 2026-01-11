import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import * as Iterable from "effect/Iterable";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { Net } from "$/network";
import { Protocol } from "$/protocol";
import { Integer } from "$/schema/number";
import { JobQueue } from "$/utils/job-queue";
import { Log } from "$/utils/log";
import { normalize } from "$/utils/string";

export const StartServer = Effect.gen(function* () {
	const config = yield* AppConfig;
	const server = yield* Net.Server.start({
		host: config.host,
		port: config.port,
	});
	yield* Log.logInfo("Listening", { HOST: config.host, PORT: config.port });

	const replicas = new Set<Net.Socket.Socket>();

	return yield* Net.Server.handleConnections(server, (socket) =>
		handleConnection(socket, {
			notifyReplicas: Effect.fn(
				function* (command) {
					if (replicas.size === 0) {
						return;
					}

					yield* Log.logInfo("Replicating", {
						replicas: replicas.size,
						command: Protocol.format(command),
					});

					const message = yield* Protocol.encode(command);
					yield* Effect.all(
						Iterable.map(replicas, (socket) => {
							return Net.Socket.write(socket, message).pipe(
								Effect.tapError((error) =>
									Log.logError("Failed to notify replica", {
										command: Protocol.format(command),
										error: error,
										replica: `${socket.remoteAddress}:${socket.remotePort}`,
									}),
								),
							);
						}),
						{ concurrency: "unbounded", mode: "either" },
					);
				},
				Effect.catchTag("ParseError", (e) =>
					Log.logError("Failed to encode replica notification", { error: e }),
				),
				Effect.ensureErrorType<never>(),
				Effect.fork,
			),
			registerReplica: Effect.sync(() => replicas.add(socket)),
			unregisterReplica: Effect.zip(
				Log.logInfo("Unregistered replica", {
					replica: `${socket.remoteAddress}:${socket.remotePort}`,
				}),
				Effect.sync(() => replicas.delete(socket)),
				{ concurrent: true },
			),
		}),
	);
});

const encodeResponse = Effect.fn(function* (input: Protocol.Value) {
	const encoded = yield* Protocol.encode(input);
	yield* Log.logInfo("Encoded", { data: normalize(encoded) });
	return encoded;
}, Log.withSpan("encode"));

const writeValue = Effect.fn(function* (
	socket: Net.Socket.Socket,
	data: Protocol.Value,
) {
	const encoded = yield* encodeResponse(data);
	yield* Net.Socket.write(socket, encoded);
});

const decodeBuffer = Effect.fn(function* (buffer: Buffer) {
	const decoded = yield* Protocol.decodeBuffer(buffer);
	yield* Log.logInfo("Decoded", { data: Protocol.format(decoded) });
	return decoded;
}, Log.withSpan("decode"));

interface ConnectionContext {
	readonly notifyReplicas: (command: Protocol.Value) => Effect.Effect<void>;
	readonly registerReplica: Effect.Effect<void>;
	readonly unregisterReplica: Effect.Effect<void>;
}
export const handleConnection = Effect.fn(function* (
	socket: Net.Socket.Socket,
	ctx?: ConnectionContext,
) {
	yield* Effect.logInfo("Connection opened");
	yield* Effect.addFinalizer(() => ctx?.unregisterReplica ?? Effect.void);

	const command = yield* Command.Processor;

	function write(data: Protocol.Value) {
		return writeValue(socket, data);
	}

	const SendFallbackError = Protocol.fail("Internal Error").pipe(
		write,
		Effect.catchTag("ParseError", (error) => {
			return Log.logError("Failed to send a default error", {
				error: error.message,
			});
		}),
	);

	const handleProcessResponse = Effect.fn(function* (
		response: Command.Response,
	) {
		if (response instanceof Command.Instruction) {
			return yield* response
				.run({
					respond: write,
					rawRespond(data) {
						return Effect.log("Raw Response sent").pipe(
							Effect.andThen(Net.Socket.write(socket, data)),
						);
					},
					notifyReplicas: ctx?.notifyReplicas ?? (() => Effect.void),
					registerReplica: ctx?.registerReplica ?? Effect.void,
				})
				.pipe(Effect.catchTag("RespError", write));
		}

		yield* write(response);
	});

	const onMessage = flow(
		command.process,
		Effect.catchTag("RespError", (error) => Effect.succeed(error)),
		Effect.flatMap(handleProcessResponse),
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
