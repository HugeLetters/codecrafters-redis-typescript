import { RuntimeConfig } from "$/config";
import { KV } from "$/kv";
import { Resp } from "$/schema/resp";
import {
	Duration,
	Effect,
	Match,
	Number as Num,
	Option,
	Predicate,
} from "effect";

export type ProcessInput = Resp.RespValue;
export type Process = CommandProcessor["process"];
export type ProcessResult = ReturnType<Process>;
export type ProcessSuccess = Resp.RespValue;
export type ProcessError = Resp.Error;
export type ProcessContext = Effect.Effect.Context<ProcessResult>;

export class CommandProcessor extends Effect.Service<CommandProcessor>()(
	"CommandProcessor",
	{
		effect: Effect.gen(function* () {
			const kv = yield* KV;
			const runtimeConfig = yield* RuntimeConfig;
			return {
				process: Match.type<ProcessInput>().pipe(
					Match.withReturnType<Effect.Effect<ProcessSuccess, ProcessError>>(),
					Match.when(["PING"], () => Effect.succeed("PONG")),
					Match.when(["ECHO", Match.string], ([, message]) =>
						Effect.succeed(message),
					),
					Match.when(["GET", Match.string], ([, key]) =>
						Effect.gen(function* () {
							const result = yield* kv
								.get(key)
								.pipe(Effect.map(Option.map(({ value }) => value)));

							return Option.getOrNull(result);
						}),
					),
					Match.when(
						["SET", Match.string, Match.string],
						([, key, value, ...rest]) =>
							Effect.gen(function* () {
								const opts = yield* parseSetOptions(rest).pipe(
									Effect.mapError(
										(message) => new Resp.Error({ message: `SET: ${message}` }),
									),
								);

								yield* kv.set(key, value, { ttl: opts.PX });
								return "OK";
							}),
					),
					Match.when(["CONFIG", "GET", Match.string], ([, , key]) =>
						runtimeConfig.get(key).pipe(
							Effect.map((value) => [key, value] as const),
							Effect.catchTag("NoSuchElementException", () =>
								fail(`Key ${key} is not set`),
							),
						),
					),
					Match.when([Match.string], ([command]) =>
						fail(`Unexpected command ${command}`),
					),
					Match.orElse(() => fail("Unexpected input")),
				),
			};
		}),
	},
) {}

function fail(message: string) {
	return Effect.fail(new Resp.Error({ message }));
}

interface SetOptions {
	PX?: Duration.Duration;
}

const parseSetOptions = Effect.fn(function* (
	args: ReadonlyArray<Resp.RespValue>,
) {
	const iter = args[Symbol.iterator]();
	const parsed: SetOptions = {};

	for (const chunk of iter) {
		if (chunk === "PX" || chunk === "px") {
			const duration = yield* Effect.succeed(iter.next()).pipe(
				Effect.flatMap((value) =>
					!value.done
						? Effect.succeed(value.value)
						: Effect.fail("Received PX option without a value"),
				),
				Effect.flatMap((value) =>
					Predicate.isString(value)
						? Effect.succeed(value)
						: Effect.fail("Received PX option with a non-string value"),
				),
				Effect.flatMap(Num.parse),
				Effect.catchTag("NoSuchElementException", () =>
					Effect.fail("Received PX option with a non-numeric string value"),
				),
				Effect.map(Duration.millis),
			);

			parsed.PX = duration;
			// we don't need any other args yet
			return parsed;
		}
	}

	return parsed;
});
