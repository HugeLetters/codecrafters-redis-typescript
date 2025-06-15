import { KV } from "$/kv";
import { Resp } from "$/schema/resp";
import { Effect, Match, Option } from "effect";

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
			return {
				process: Match.type<ProcessInput>().pipe(
					Match.withReturnType<Effect.Effect<ProcessSuccess, ProcessError>>(),
					Match.when(["PING"], () => Effect.succeed("PONG")),
					Match.when(["ECHO", Match.string], ([, message]) =>
						Effect.succeed(message),
					),
					Match.when(["GET", Match.string], ([, key]) =>
						Effect.gen(function* () {
							const result = yield* kv.get(key);
							return Option.getOrNull(result);
						}),
					),
					Match.when(["SET", Match.string, Match.string], ([, key, value]) =>
						Effect.gen(function* () {
							yield* kv.set(key, value);
							return "OK";
						}),
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

function fail(message: string): Effect.Effect<never, ProcessError> {
	return new Resp.Error({ message });
}
