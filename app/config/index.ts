import { Effect, HashMap, Record } from "effect";
import { Config } from "./config";

export class RuntimeConfig extends Effect.Service<RuntimeConfig>()(
	"RuntimeConfig",
	{
		effect: Effect.gen(function* () {
			const config = yield* Config.pipe(
				Effect.map(Record.toEntries),
				Effect.map(HashMap.fromIterable<string, string>),
			);

			return {
				get(key: string) {
					return HashMap.get(config, key);
				},
			};
		}),
	},
) {}
