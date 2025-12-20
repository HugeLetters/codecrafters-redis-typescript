import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Record from "effect/Record";
import { argvConfigProvider } from "$/utils/config/argv";
import { Config } from "./config";

export class AppConfig extends Effect.Service<AppConfig>()(
	"@config/AppConfig",
	{
		effect: Effect.gen(function* () {
			const config = yield* Config.pipe(
				Effect.withConfigProvider(argvConfigProvider()),
			);

			const configMap = pipe(
				config,
				Record.toEntries,
				HashMap.fromIterable<string, string>,
			);

			function get(key: string) {
				return HashMap.get(configMap, key);
			}

			return {
				get,
				getKnown<K extends keyof typeof config>(key: K) {
					return config[key];
				},
			};
		}),
	},
) {}
