import {
	DateTime,
	Duration,
	Effect,
	Function as Fn,
	HashMap,
	Option,
	SynchronizedRef,
} from "effect";

export class KV extends Effect.Service<KV>()("KV", {
	effect: Effect.gen(function* () {
		const storageInit: Storage = HashMap.empty();
		const storageRef = yield* SynchronizedRef.make(storageInit);
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
						const isExpired = value.value.expiry.pipe(
							Option.map(DateTime.lessThanOrEqualTo(now)),
							Option.getOrElse(Fn.constFalse),
						);
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
	}),
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
