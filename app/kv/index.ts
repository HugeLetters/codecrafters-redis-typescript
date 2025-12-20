import * as Arr from "effect/Array";
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { Logger } from "$/utils/logger";

export namespace KV {
	export class KvStorage extends Effect.Service<KvStorage>()("@kv/KvStorage", {
		scoped: Effect.gen(function* () {
			const storageInit = HashMap.empty<string, Value>();
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
					yield* Logger.logInfo("Cleanup", { key });
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
		}).pipe(Logger.withSpan("KvStorage")),
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
}
