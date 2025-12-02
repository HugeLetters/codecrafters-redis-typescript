import { expect } from "bun:test";
import { fail } from "node:assert/strict";
import { inspect } from "bun";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Fn from "effect/Function";

import { Stdout } from "$/utils/stdout";

export { test } from "./effect-buntest";

export function expectFail<E, R>(self: Effect.Effect<unknown, E, R>) {
	return self.pipe(Effect.map(unexpectedSuccess), Effect.flip);
}

const unexpectedSuccess = Fn.flow(
	(v) => inspect(v, { colors: true, depth: 10 }),
	(v) => `Expected effect to fail. Received: ${v}`,
	(m) => fail(m),
);

export function expectEquivalence<T>(self: T, that: T) {
	const message = `Expected ${Stdout.colored("red", self)} to equal ${Stdout.green(that)}.`;
	return expect(Equal.equals(self, that), message).toBeTrue();
}
