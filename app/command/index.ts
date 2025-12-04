import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Num from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { Protocol } from "$/protocol";
import { CommandOption } from "./options";

export namespace Command {
	export type Input = Protocol.Decoded;
	export type RunProcessor = Processor["process"];
	export type Result = ReturnType<RunProcessor>;
	export type Success = Protocol.Decoded;
	export type Error = Protocol.Error;
	export type Context = Effect.Effect.Context<Result>;

	export class Processor extends Effect.Service<Processor>()(
		"@command/Processor",
		{
			effect: Effect.gen(function* () {
				const kv = yield* KV.KvStorage;
				const runtimeConfig = yield* AppConfig;
				return {
					process: Match.type<Input>().pipe(
						Match.withReturnType<Effect.Effect<Success, Error>>(),
						Match.when(["PING"], () => Effect.succeed("PONG")),
						Match.when(["ECHO", Match.string], ([_, message]) =>
							Effect.succeed(message),
						),
						Match.when(["GET", Match.string], ([_, key]) =>
							Effect.gen(function* () {
								const result = yield* kv.get(key);
								return result.pipe(
									Option.map((v) => v.value),
									Option.getOrNull,
								);
							}),
						),
						Match.when(
							["SET", Match.string, Match.string],
							([_, key, value, ...rest]) =>
								Effect.gen(function* () {
									const opts = yield* parseSetOptions(rest).pipe(
										Effect.mapError(
											(message) =>
												new Protocol.Error({
													message: `SET: ${formatCommandOptionError(message)}`,
												}),
										),
									);

									yield* kv.set(key, value, { ttl: opts.PX });
									return "OK";
								}),
						),
						Match.when(["CONFIG", "GET", Match.string], ([_, _2, key]) =>
							runtimeConfig.get(key).pipe(
								Effect.map((value) => [key, value] as const),
								Effect.catchTag("NoSuchElementException", () =>
									fail(`Key ${key} is not set`),
								),
							),
						),
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
		return Effect.fail(new Protocol.Error({ message }));
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
