import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Num from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Protocol } from "$/protocol";
import { RDB } from "$/rdb";
import { Replication } from "$/replication";
import { Resp } from "$/resp";
import { type Integer, IntegerFromString } from "$/schema/number";
import { getInfo } from "./info";
import { CommandOption } from "./options";

export namespace Command {
	export type Input = Protocol.Decoded;
	export type Value<V extends Protocol.Decoded = Protocol.Decoded> =
		Protocol.Value<V>;
	export type Error = Protocol.Error;

	export type RespondFn<E, R> = (
		data: Protocol.Value,
	) => Effect.Effect<void, E, R>;
	export interface InstructionContext<E = never, R = never> {
		readonly respond: (data: Protocol.Value) => Effect.Effect<void, E, R>;
		readonly rawRespond: (data: Buffer | string) => Effect.Effect<void, E, R>;
		readonly notifyReplicas: (
			command: Protocol.Value,
		) => Effect.Effect<boolean, E, R>;
		readonly registerReplica: Effect.Effect<void, E, R>;
	}
	export class Instruction extends Data.TaggedClass("Instruction")<{
		run: <E, R>(
			ctx: InstructionContext<E, R>,
		) => Effect.Effect<void, E | Error, R>;
	}> {}
	type InstructionEffect = Effect.Effect<Instruction, Error>;
	type Result<V extends Protocol.Decoded> = Effect.Effect<V, Error>;

	interface ExecutorImpl {
		ping: Result<"PONG">;
		echo: (value: string) => Result<string>;
		get: (key: string) => Result<string | null>;
		set: (key: string, value: string, opts: SetOptions) => Result<"OK">;
		keys: (pattern: string) => Result<ReadonlyArray<string>>;
		config: {
			get: (
				key: string,
			) => Result<readonly [key: string, value: Protocol.Decoded]>;
		};
		info: (headers: ReadonlyArray<Input>) => Result<string>;
		replconf: {
			listeningPort: (port: Integer) => Result<"OK">;
			capabilites: (protocol: string) => Result<"OK">;
		};
		psync: (replicationId: string, offset: number) => InstructionEffect;
	}

	function fullResyncResponse(data: Replication.MasterData) {
		return `FULLRESYNC ${data.replicationId} ${data.replicationOffset}` as const;
	}

	export class Executor extends Effect.Service<Executor>()(
		"@codecrafters/redis/app/command/index/Executor",
		{
			effect: Effect.gen(function* () {
				const kv = yield* KV.KvStorage;
				const appConfig = yield* AppConfig;
				const replication = yield* Replication.Service;

				const service: ExecutorImpl = {
					ping: Effect.succeed("PONG"),
					echo: Effect.succeed,
					get: Effect.fn(function* (key) {
						const result = yield* kv.get(key);
						return result.pipe(
							Option.map((v) => v.value),
							Option.getOrNull,
						);
					}),
					set: Effect.fn(function* (key, value, opts) {
						yield* kv.set(key, value, { ttl: opts.PX });
						return "OK" as const;
					}),
					keys: Effect.fn(function (pattern: string) {
						return kv.keys(pattern);
					}),
					config: {
						get: Effect.fn(function (key: string) {
							return appConfig.get(key).pipe(
								Effect.map((value) => [key, value] as const),
								Effect.catchTag("NoSuchElementException", () =>
									fail(`Key ${key} is not set`),
								),
							);
						}),
					},
					info: Effect.fn(
						function (_headers) {
							const headers = _headers.filter(Predicate.isString);
							if (headers.length !== _headers.length) {
								return fail(
									`Encountered non-string headers: ${Protocol.format(_headers)}`,
								);
							}

							return getInfo(headers);
						},
						Effect.provideService(Replication.Service, replication),
					),
					replconf: {
						capabilites(_protocol) {
							return Effect.succeed("OK");
						},
						listeningPort(_port) {
							return Effect.succeed("OK");
						},
					},
					psync(_replicationId, _offset) {
						const instruction = new Instruction({
							run: Effect.fn(function* (ctx) {
								if (replication.data.role === "slave") {
									return yield* fail(
										"PSYNC command is not supported on slave servers",
									);
								}

								yield* ctx.respond(
									Protocol.simple(fullResyncResponse(replication.data)),
								);

								const rdb = yield* kv.asRDB;
								const encodedRdb = yield* RDB.encode(rdb).pipe(
									Effect.tapError(Effect.logError),
									Effect.mapError(() => fail("Internal Error")),
								);
								const meta = Buffer.from(
									`${Resp.V2.String.BulkStringPrefix}${encodedRdb.length}\r\n`,
								);
								yield* ctx.rawRespond(Buffer.concat([meta, encodedRdb]));

								yield* ctx.registerReplica;
							}),
						});

						return Effect.succeed(instruction);
					},
				};

				return service;
			}),
		},
	) {}

	export const ExecutorSlave = Layer.map(Executor.Default, (c) => {
		const master = Context.get(c, Executor);
		return Context.add(c, Executor, {
			...master,
			set() {
				return fail("SET command is not available for slave servers");
			},
			replconf: {
				capabilites() {
					return fail("REPLCONF command is not available for slave servers");
				},
				listeningPort() {
					return fail("REPLCONF command is not available for slave servers");
				},
			},
			psync() {
				return fail("PSYNC command is not supported on slave servers");
			},
		});
	});

	export type Response = Value | Instruction;
	// TODO master | when command is valid but parameter doesn't match - it will respond with unexpected command error instead of saying that parameter is of unexpected type etc - fix | by Evgenii Perminov at Mon, 05 Jan 2026 18:56:56 GMT
	export class Processor extends Effect.Service<Processor>()(
		"@command/Processor",
		{
			effect: Effect.gen(function* () {
				const executor = yield* Executor;
				const replication = yield* Replication.Service;

				type Result = Effect.Effect<Response, Error>;

				const matchReplConf = Match.type<Input>().pipe(
					Match.withReturnType<Result>(),
					Match.when(["listening-port", Match.string], ([_, rawPort]) => {
						return Effect.gen(function* () {
							const port = yield* Schema.decode(IntegerFromString)(
								rawPort,
							).pipe(
								Effect.mapError(() =>
									fail("Expected port to be an integer-string"),
								),
							);
							return yield* executor.replconf
								.listeningPort(port)
								.pipe(Effect.map(Protocol.simple));
						});
					}),
					Match.when(["capa", Match.string], ([_, protocol]) =>
						executor.replconf
							.capabilites(protocol)
							.pipe(Effect.map(Protocol.simple)),
					),
					Match.when([Match.string], ([command]) =>
						fail(`Unexpected REPLCONF subcommand: ${command}`),
					),
					Match.orElse((value) =>
						fail(`Unexpected REPLCONF input: ${Protocol.format(value)}`),
					),
				);

				const process: (value: Input) => Result = Match.type<Input>().pipe(
					Match.withReturnType<Result>(),
					Match.when(["PING"], () => {
						return executor.ping.pipe(Effect.map(Protocol.simple));
					}),
					Match.when(["ECHO", Match.string], ([_, message]) =>
						executor.echo(message),
					),
					Match.when(["GET", Match.string], ([_, key]) => executor.get(key)),
					Match.when(["SET", Match.string, Match.string], (cmd) => {
						const [_, key, value, ...rest] = cmd;

						return Effect.succeed(
							new Instruction({
								run: Effect.fn(function* (ctx) {
									const opts = yield* parseSetOptions(rest).pipe(
										Effect.mapError((message) =>
											fail(`SET: ${formatCommandOptionError(message)}`),
										),
									);

									yield* ctx.notifyReplicas(cmd);
									const res = yield* executor.set(key, value, opts);

									if (replication.data.role === "slave") {
										return;
									}

									yield* ctx.respond(Protocol.simple(res));
								}),
							}),
						);
					}),
					Match.when(["KEYS", Match.string], ([_, pattern]) =>
						executor.keys(pattern),
					),
					Match.when(["CONFIG", "GET", Match.string], ([_, _2, key]) =>
						executor.config.get(key),
					),
					Match.when(["INFO"], ([_, ...headers]) => executor.info(headers)),
					Match.when(["REPLCONF"], ([_, ...rest]) => matchReplConf(rest)),
					Match.when(
						["PSYNC", Match.string, Match.string],
						([_, id, rawOffset]) => {
							return Effect.gen(function* () {
								const offset = yield* Schema.decode(IntegerFromString)(
									rawOffset,
								).pipe(
									Effect.mapError(() =>
										fail("Expected offset to be an integer-string"),
									),
								);

								return yield* executor.psync(id, offset);
							});
						},
					),
					Match.when([Match.string], ([command]) =>
						fail(`Unexpected command: ${command}`),
					),
					Match.when(Protocol.isError, (err) => {
						return Effect.succeed(
							new Instruction({
								run() {
									return Effect.logError(Protocol.format(err));
								},
							}),
						);
					}),
					Match.orElse((value) =>
						fail(`Unexpected input: ${Protocol.format(value)}`),
					),
				);

				return {
					process,
				};
			}),
		},
	) {}

	function fail(message: string) {
		return Protocol.fail(message);
	}

	const parseSetOptions = CommandOption.parser({
		/** Time-to-live */
		PX: pipe(
			CommandOption.single(),
			(_) =>
				CommandOption.mapEffect(
					_,
					Effect.fn(function* (value) {
						if (Predicate.isString(value)) {
							const parsed = yield* Num.parse(value).pipe(
								Effect.mapError(() => "Value is not a numeric string"),
							);
							return Duration.millis(parsed);
						}

						if (Predicate.isNumber(value)) {
							return Duration.millis(value);
						}

						return yield* Effect.fail(
							"Value is neither number or numberic string",
						);
					}),
				),
			CommandOption.optionalOrUndefined,
		),
	});

	type SetOptions = Effect.Effect.Success<ReturnType<typeof parseSetOptions>>;
}

function formatCommandOptionError(
	error: CommandOption.Error.t<string | Error>,
) {
	return CommandOption.Error.format(error, (err) => {
		return Predicate.isString(err) ? err : err.message;
	});
}
