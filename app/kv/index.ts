import { Effect, HashMap, SynchronizedRef } from "effect";

export class KV extends Effect.Service<KV>()("KV", {
	effect: Effect.gen(function* () {
		const initialMap = HashMap.empty<string, string>();
		const storageRef = yield* SynchronizedRef.make(initialMap);
		return {
			get: Effect.fn(function* (key: string) {
				const storage = yield* storageRef;
				return HashMap.get(storage, key);
			}),
			set: Effect.fn(function* (key: string, value: string) {
				yield* SynchronizedRef.update(storageRef, (storage) => {
					return HashMap.set(storage, key, value);
				});
			}),
		};
	}),
}) {}
