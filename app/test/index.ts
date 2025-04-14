import { fail } from "node:assert/strict";
import { inspect } from "bun";
import { Effect, flow } from "effect";

export { test } from "./effect-buntest";

export function expectFail<E, R>(self: Effect.Effect<unknown, E, R>) {
	return self.pipe(Effect.map(unexpectedSuccess), Effect.flip);
}

const unexpectedSuccess = flow(
	(v) => inspect(v, { colors: true, depth: 10 }),
	(v) => `Expected effect to fail. Received: ${v}`,
	(m) => fail(m),
);
