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
		const storageInit = HashMap.empty<string, KvValue>();
		const storageRef = yield* SynchronizedRef.make(storageInit);
		return {
			get(key: string) {
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
							return [Option.none<KvValue>(), updated];
						}

						return [value, storage];
					}),
				);
			},
			set: Effect.fn(function* (
				key: string,
				value: string,
				options: KVSetOptions = {},
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

export interface KvValue {
	readonly expiry: Option.Option<DateTime.Utc>;
	readonly value: string;
}

export interface KVSetOptions {
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
