import * as BunContext from "@effect/platform-bun/BunContext";
import * as Arr from "effect/Array";
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Iterable from "effect/Iterable";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { AppConfig } from "$/config";
import { RDB } from "$/rdb";
import { Log } from "$/utils/log";

export namespace KV {
	export class KvStorage extends Effect.Service<KvStorage>()("@kv/KvStorage", {
		scoped: Effect.gen(function* () {
			const storageInit = yield* createStorageInit;
			const storageRef = yield* SynchronizedRef.make(storageInit);

			const CleanupFirstExpired = SynchronizedRef.updateEffect(
				storageRef,
				Effect.fn(function* (storage) {
					const now = yield* DateTime.now;
					const result = HashMap.findFirst(storage, (v) =>
						checkIsExpired(now, v.expiry),
					);
					if (Option.isNone(result)) {
						return storage;
					}

					const [key] = result.value;
					yield* Log.logInfo("Cleanup", { key });
					return HashMap.remove(storage, key);
				}),
			);
			const cleanupCron = Cron.make({
				seconds: [0],
				minutes: [],
				hours: [],
				weekdays: [],
				days: [],
				months: [],
			});
			const cleanupSchedule = Schedule.cron(cleanupCron);
			yield* CleanupFirstExpired.pipe(
				Effect.schedule(cleanupSchedule),
				Effect.forkScoped,
			);

			return {
				get(key: Key) {
					return SynchronizedRef.modifyEffect(
						storageRef,
						Effect.fn(function* (storage) {
							const value = HashMap.get(storage, key);
							if (Option.isNone(value)) {
								return [value, storage];
							}

							const now = yield* DateTime.now;
							const isExpired = checkIsExpired(now, value.value.expiry);
							if (isExpired) {
								const updated = HashMap.remove(storage, key);
								return [Option.none<Value>(), updated];
							}

							return [value, storage];
						}),
					);
				},
				set: Effect.fn(function* (
					key: Key,
					value: PlainValue,
					options: SetOptions = {},
				) {
					const ttl = options.ttl ?? Duration.infinity;
					const expiry = yield* getExpiry(ttl);
					yield* SynchronizedRef.update(storageRef, (storage) => {
						return HashMap.set(storage, key, { value, expiry });
					});
				}),
				keys: Effect.fn(function* (pattern: string) {
					if (pattern === "*") {
						const storage = yield* storageRef;
						return storage.pipe(HashMap.keys, Arr.fromIterable);
					}

					return Arr.empty<string>();
				}),
			};
		}).pipe(Log.withSpan("kv.storage")),
		dependencies: [AppConfig.Default, BunContext.layer],
	}) {}

	export type Key = string;
	export type PlainValue = string;
	export interface Value {
		readonly expiry: Option.Option<DateTime.Utc>;
		readonly value: PlainValue;
	}

	export interface SetOptions {
		readonly ttl?: Duration.Duration | undefined;
	}

	const getExpiry = Effect.fn(function* (ttl: Duration.Duration) {
		if (!Duration.isFinite(ttl)) {
			return Option.none();
		}

		const now = yield* DateTime.now;
		const expiry = DateTime.addDuration(now, ttl);
		return Option.some(expiry);
	});

	function checkIsExpired(now: DateTime.Utc, expiry: Value["expiry"]) {
		return expiry.pipe(
			Option.map(DateTime.lessThanOrEqualTo(now)),
			Option.getOrElse(Fn.constFalse),
		);
	}

	const getRDBData = Effect.gen(function* () {
		const { rdbPath } = yield* AppConfig;
		if (Option.isNone(rdbPath)) {
			return Option.none();
		}

		return yield* RDB.decodeFile(rdbPath.value).pipe(
			Effect.tapError(Effect.logError),
			Effect.option,
		);
	});

	const createStorageInit = Effect.gen(function* () {
		const rdb = yield* getRDBData;
		if (Option.isNone(rdb)) {
			return HashMap.empty<string, Value>();
		}

		const { databases } = rdb.value;
		const now = (yield* DateTime.now).pipe(DateTime.toEpochMillis);
		return databases.pipe(
			HashMap.values,
			Iterable.flatMap((db) => db.entries),
			Iterable.filterMap(([key, value]): Option.Option<[string, Value]> => {
				const { expiry } = value;
				if (expiry !== null && expiry <= now) {
					return Option.none();
				}

				return rdbValueToKvValue(value.value).pipe(
					Option.map((value) => {
						const parsedExpiry = Option.fromNullable(expiry).pipe(
							Option.map(Number),
							Option.flatMap(DateTime.make),
							Option.map(DateTime.toUtc),
						);
						return [key, { value, expiry: parsedExpiry }];
					}),
				);
			}),
			HashMap.fromIterable,
		);
	});

	function rdbValueToKvValue(value: RDB.Value): Option.Option<PlainValue> {
		if (typeof value !== "string") {
			return Option.none();
		}

		return Option.some(value);
	}
}
