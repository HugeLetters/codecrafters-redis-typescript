import { green, red } from "$/stdout";
import { inspect } from "bun";
import { expect } from "bun:test";
import { Effect, Equal, flow } from "effect";
import { fail } from "node:assert/strict";

export { test } from "./effect-buntest";

export function expectFail<E, R>(self: Effect.Effect<unknown, E, R>) {
	return self.pipe(Effect.map(unexpectedSuccess), Effect.flip);
}

const unexpectedSuccess = flow(
	(v) => inspect(v, { colors: true, depth: 10 }),
	(v) => `Expected effect to fail. Received: ${v}`,
	(m) => fail(m),
);

export function expectEquivalence<T>(self: T, that: T) {
	const message = `Expected ${red(self)} to equal ${green(that)}.`;
	return expect(Equal.equals(self, that), message).toBeTrue();
}
