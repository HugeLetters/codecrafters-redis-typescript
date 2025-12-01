import {
	Cron,
	DateTime,
	Duration,
	Effect,
	Function as Fn,
	HashMap,
	Option,
	Schedule,
	SynchronizedRef,
} from "effect";
import { Logger } from "$/utils/logger";

export class KV extends Effect.Service<KV>()("KV", {
	effect: Effect.gen(function* () {
		const storageInit: Storage = HashMap.empty();
		const storageRef = yield* SynchronizedRef.make(storageInit);

		function checkIsExpired(now: DateTime.Utc, expiry: Value["expiry"]) {
			return expiry.pipe(
				Option.map(DateTime.lessThanOrEqualTo(now)),
				Option.getOrElse(Fn.constFalse),
			);
		}

		const cleanupFirstExpired = SynchronizedRef.updateEffect(
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
		const cleanupSchedula = Schedule.cron(cleanupCron);
		yield* cleanupFirstExpired.pipe(
			Effect.schedule(cleanupSchedula),
			Effect.fork,
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
		};
	}).pipe(Logger.withSpan("KV")),
}) {}

export type Key = string;
export type PlainValue = string;
export interface Value {
	readonly expiry: Option.Option<DateTime.Utc>;
	readonly value: PlainValue;
}
export type Storage = HashMap.HashMap<string, Value>;

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
