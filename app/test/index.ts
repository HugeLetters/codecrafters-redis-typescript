import { inspect } from "bun";
import { test as bunTest } from "bun:test";
import { Effect, flow } from "effect";
import { fail } from "node:assert/strict";

function effect(name: string, run: () => Effect.Effect<unknown, unknown>) {
	return bunTest(name, () => {
		// todo - prettier test fail error
		return Effect.runPromise(run());
	});
}

export const test = Object.assign(bunTest, { effect });

export function expectFail<E, R>(self: Effect.Effect<unknown, E, R>) {
	return self.pipe(Effect.map(unexpectedSuccess), Effect.flip);
}

const unexpectedSuccess = flow(
	(v) => inspect(v, { colors: true, depth: 10 }),
	(v) => `Expected effect to fail. Received: ${v}`,
	(m) => fail(m),
);
