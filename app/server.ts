import * as Arr from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import * as Iterable from "effect/Iterable";
import * as Option from "effect/Option";
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

const TOO_MANY_COMMANDS_THRESHOLD = 1_000;
class TooManyCommandsError extends Data.TaggedError("TooManyCommands") {}

const decodeCommands = Effect.fn(function* (buffer: Buffer) {
	let commands = Chunk.empty<Protocol.Decoded>();
	const Pull = Protocol.createDecodePull(Protocol.bufferToString(buffer));

	while (true) {
		if (commands.length > TOO_MANY_COMMANDS_THRESHOLD) {
			return yield* new TooManyCommandsError();
		}

		const pulled = yield* Pull;
		if (Option.isNone(pulled)) {
			break;
		}

		const command = pulled.value;
		yield* Log.logInfo("Decoded", { data: Protocol.format(command) });
		commands = Chunk.append(commands, command);
	}

	return commands;
}, Log.withSpan("decode"));

interface ConnectionContext {
	readonly notifyReplicas: (command: Protocol.Value) => Effect.Effect<void>;
	readonly registerReplica: Effect.Effect<void>;
	readonly unregisterReplica: Effect.Effect<void>;
}
export const handleConnection = Effect.fn(function* (
	socket: Net.Socket.Socket,
	ctx: ConnectionContext = {
		notifyReplicas: () => Effect.void,
		registerReplica: Effect.void,
		unregisterReplica: Effect.void,
	},
) {
	yield* Effect.logInfo("Connection opened");
	yield* Effect.addFinalizer(() => ctx.unregisterReplica);

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

	const CommandCtx = {
		respond: write,
		rawRespond(data) {
			return Effect.log("Raw Response sent").pipe(
				Effect.andThen(Net.Socket.write(socket, data)),
			);
		},
		notifyReplicas: ctx.notifyReplicas,
		registerReplica: ctx.registerReplica,
	} satisfies Command.CommandContext<unknown, unknown>;

	const processCommand = Effect.fn(function* (self: Protocol.Decoded) {
		const response = yield* command.process(self, CommandCtx);

		if (response instanceof Command.Instruction) {
			return yield* response
				.run(CommandCtx)
				.pipe(Effect.map(() => Option.none()));
		}

		return Option.some(response);
	});

	const processSingle = Effect.fn(
		function* (command: Protocol.Decoded) {
			const response = yield* processCommand(command);
			if (Option.isNone(response)) {
				return;
			}

			yield* write(response.value);
		},
		Effect.catchTag("RespError", (error) => write(error)),
	);

	const processPipeline = Effect.fn(function* (
		commands: Chunk.NonEmptyChunk<Protocol.Decoded>,
	) {
		let responses = Chunk.empty<Protocol.Value>();

		const ProcessResponses = Effect.forEach(
			commands,
			(command) => {
				return processCommand(command).pipe(
					Effect.tap((response) => {
						responses = Chunk.append(responses, Option.getOrNull(response));
					}),
				);
			},
			{ discard: true },
		);

		yield* ProcessResponses.pipe(
			Effect.catchTag("RespError", (error) => {
				responses = Chunk.append(responses, error);
				return Effect.void;
			}),
		);

		const encoded = yield* Effect.all(Chunk.map(responses, encodeResponse), {
			concurrency: "unbounded",
		});

		yield* Net.Socket.write(socket, Arr.join(encoded, ""));
	});

	const processCommands = Effect.fn(
		function* (commands: Chunk.Chunk<Protocol.Decoded>) {
			if (!Chunk.isNonEmpty(commands)) {
				yield* write(Protocol.fail("Empty request"));
				return;
			}

			if (commands.length === 1) {
				const command = Chunk.headNonEmpty(commands);
				yield* processSingle(command);
				return;
			}

			yield* processPipeline(commands);
		},
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

	type Context = Effect.Effect.Context<ReturnType<typeof processPipeline>>;
	const messageQueue = yield* JobQueue.make<Context>(Integer.make(1));

	const onMessage = flow(
		decodeCommands,
		Effect.flatMap((commands) =>
			JobQueue.offer(messageQueue, processCommands(commands)),
		),
		Effect.catchTag("TooManyCommands", () =>
			write(
				Protocol.fail(
					`Cannot pipeline more than ${TOO_MANY_COMMANDS_THRESHOLD} commands`,
				),
			),
		),
		Effect.catchTag("SocketWrite", (error) => {
			return Log.logError("Socket write failed", { error: error.message });
		}),
		Effect.catchTag("ParseError", (error) =>
			Log.logError("Invalid message", { error: error.message }),
		),
	);

	yield* Net.Socket.handleMessages(socket, onMessage);
	yield* Effect.logInfo("Connection closed");
});

