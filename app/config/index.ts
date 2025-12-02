import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Record from "effect/Record";

import { argvConfigProvider } from "$/utils/config";
import { Config } from "./config";

export class RuntimeConfig extends Effect.Service<RuntimeConfig>()(
	"RuntimeConfig",
	{
		effect: Effect.gen(function* () {
			const config = yield* Config.pipe(
				Effect.withConfigProvider(argvConfigProvider()),
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
