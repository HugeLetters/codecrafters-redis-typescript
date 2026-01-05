import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Num from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Protocol } from "$/protocol";
import { Replication } from "$/replication";
import { getInfo } from "./info";
import { CommandOption } from "./options";

export namespace Command {
	export type Input = Protocol.Decoded;
	export type Value<V extends Protocol.Decoded = Protocol.Decoded> =
		Protocol.Value<V>;
	export type Error = Protocol.Error;
	export type Result<V extends Protocol.Decoded = Protocol.Decoded> =
		Effect.Effect<Value<V>, Error>;

	interface ExecutorImpl {
		ping: Result<"PONG">;
		echo: (value: string) => Result<string>;
		get: (key: string) => Result<string | null>;
		set: (
			key: string,
			value: string,
			opts: ReadonlyArray<Input>,
		) => Result<"OK">;
		keys: (pattern: string) => Result<ReadonlyArray<string>>;
		config: {
			get: (
				key: string,
			) => Result<readonly [key: string, value: Protocol.Decoded]>;
		};
		info: (headers: ReadonlyArray<Input>) => Result<string>;
	}

	export class Executor extends Effect.Service<Executor>()(
		"@codecrafters/redis/app/command/index/Executor",
		{
			effect: Effect.gen(function* () {
				const kv = yield* KV.KvStorage;
				const appConfig = yield* AppConfig;
				const replication = yield* Replication.Service;

				const service: ExecutorImpl = {
					ping: Effect.succeed(Protocol.simple("PONG")),
					echo: Effect.succeed,
					get: Effect.fn(function* (key) {
						const result = yield* kv.get(key);
						return result.pipe(
							Option.map((v) => v.value),
							Option.getOrNull,
						);
					}),
					set: Effect.fn(function* (key, value, rest) {
						const opts = yield* parseSetOptions(rest).pipe(
							Effect.mapError((message) =>
								Protocol.fail(`SET: ${formatCommandOptionError(message)}`),
							),
						);

						yield* kv.set(key, value, { ttl: opts.PX });
						return Protocol.simple("OK");
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
				return Protocol.fail("SET command is not available for slave servers");
			},
		});
	});

	export class Processor extends Effect.Service<Processor>()(
		"@command/Processor",
		{
			effect: Effect.gen(function* () {
				const executor = yield* Executor;
				return {
					process: Match.type<Input>().pipe(
						Match.withReturnType<Effect.Effect<Value, Error, unknown>>(),
						Match.when(["PING"], () => executor.ping),
						Match.when(["ECHO", Match.string], ([_, message]) =>
							executor.echo(message),
						),
						Match.when(["GET", Match.string], ([_, key]) => executor.get(key)),
						Match.when(
							["SET", Match.string, Match.string],
							([_, key, value, ...rest]) => executor.set(key, value, rest),
						),
						Match.when(["KEYS", Match.string], ([_, pattern]) =>
							executor.keys(pattern),
						),
						Match.when(["CONFIG", "GET", Match.string], ([_, _2, key]) =>
							executor.config.get(key),
						),
						Match.when(["INFO"], ([_, ...headers]) => executor.info(headers)),
						Match.when([Match.string], ([command]) =>
							fail(`Unexpected command: ${command}`),
						),
						Match.orElse((value) =>
							fail(`Unexpected input: ${Protocol.format(value)}`),
						),
					),
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
}

function formatCommandOptionError(
	error: CommandOption.Error.t<string | Error>,
) {
	return CommandOption.Error.format(error, (err) => {
		return Predicate.isString(err) ? err : err.message;
	});
}
