import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Record from "effect/Record";

import { argvConfigProvider } from "$/utils/config";
import { Config } from "./config";

export class AppConfig extends Effect.Service<AppConfig>()(
	"@config/AppConfig",
	{
		effect: Effect.gen(function* () {
			const config = yield* Config.pipe(
				Effect.withConfigProvider(argvConfigProvider()),
				Effect.map((c) => Record.toEntries(c)),
				Effect.map((r) => HashMap.fromIterable<string, string>(r)),
			);

			return {
				get(key: string) {
					return HashMap.get(config, key);
				},
			};
		}),
	},
) {}
