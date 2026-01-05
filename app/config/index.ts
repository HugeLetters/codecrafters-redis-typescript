import * as Path from "@effect/platform/Path";
import { regex } from "arkregex";
import * as ConfigM from "effect/Config";
import * as ConfigError from "effect/ConfigError";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import { Integer, IntegerFromString } from "$/schema/number";

export class AppConfig extends Effect.Service<AppConfig>()(
	"@codecrafters/redis/app/config/index/AppConfig",
	{
		effect: Effect.gen(function* () {
			const dirKey = "dir";
			const dbFileNameKey = "dbfilename";
			const replicaOfKey = "replicaof";

			const raw = yield* ConfigM.all({
				host: ConfigM.string("host").pipe(ConfigM.withDefault("0.0.0.0")),
				port: Schema.Config("port", IntegerFromString).pipe(
					ConfigM.withDefault(Integer.make(6379)),
				),
				dir: ConfigM.string(dirKey).pipe(ConfigM.option),
				dbfilename: ConfigM.string(dbFileNameKey).pipe(ConfigM.option),
				replicaof: ConfigM.string(replicaOfKey).pipe(ConfigM.option),
			});

			const configMap = pipe(
				raw,
				Record.toEntries,
				HashMap.fromIterable<string, (typeof raw)[keyof typeof raw]>,
			);

			const path = yield* Path.Path;

			const rdbPath = yield* Effect.gen(function* () {
				const { dir, dbfilename } = raw;
				if (Option.isNone(dir) && Option.isNone(dbfilename)) {
					return Option.none();
				}

				if (Option.isNone(dir)) {
					return yield* Effect.fail(
						ConfigError.MissingData(
							[dbFileNameKey],
							`Option does not work without ${dirKey}`,
						),
					);
				}

				if (Option.isNone(dbfilename)) {
					return yield* Effect.fail(
						ConfigError.MissingData(
							[dirKey],
							`Option does not work without ${dbFileNameKey}`,
						),
					);
				}

				const full = path.resolve(dir.value, dbfilename.value);
				return Option.some(full);
			});

			const replicaof = yield* Effect.gen(function* () {
				const { replicaof } = raw;
				if (Option.isNone(replicaof)) {
					return Option.none();
				}

				const match = regex("^(?<host>.+) (?<port>\\d{1,5})$").exec(
					replicaof.value,
				);
				if (Predicate.isNull(match)) {
					return yield* Effect.fail(
						ConfigError.MissingData(
							[replicaOfKey],
							`Option must be of format HOST PORT`,
						),
					);
				}

				const host = match.groups.host;
				const port = yield* Schema.decode(IntegerFromString)(match.groups.port);
				return Option.some({ host, port });
			});

			return {
				host: raw.host,
				port: raw.port,
				rdbPath,
				replicaof,
				get(key: string) {
					return Option.gen(function* () {
						const value = yield* HashMap.get(configMap, key);
						if (Option.isOption(value)) {
							return yield* value;
						}

						return value;
					});
				},
			} as const;
		}),
	},
) {}
