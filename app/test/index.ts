import { inspect } from "bun";
import { test as bunTest } from "bun:test";
import { Effect } from "effect";
import { fail } from "node:assert/strict";

function effect(name: string, run: () => Effect.Effect<unknown, unknown>) {
	return bunTest(name, () => {
		// todo - prettier test fail error
		return Effect.runPromise(run());
	});
}

export const test = Object.assign(bunTest, { effect });

export function expectFail<A, E, R>(self: Effect.Effect<A, E, R>) {
	return self.pipe(
		Effect.map((value) => {
			fail(
				`Expected effect to fail. Received: ${inspect(value, { colors: true, depth: 10 })}`,
			);
		}),
		Effect.flip,
	);
}
