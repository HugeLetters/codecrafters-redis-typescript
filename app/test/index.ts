import { expect } from "bun:test";
import { fail } from "node:assert/strict";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Fn from "effect/Function";
import { UnknownDiffer } from "$/utils/differ";
import { Stdout } from "$/utils/stdout";

export { test } from "./effect-buntest";

export function expectFail<E, R>(self: Effect.Effect<unknown, E, R>) {
	return self.pipe(Effect.map(unexpectedSuccess), Effect.flip);
}

const unexpectedSuccess = Fn.flow(
	(v) => Bun.inspect(v, { colors: true, depth: 10 }),
	(v) => `Expected effect to fail. Received\n${v}`,
	(m) => fail(m),
);

export function expectEquivalence<T>(received: T, expected: T) {
	const patch = UnknownDiffer.differ.diff(expected, received);
	const diff = UnknownDiffer.Formatter.format(patch);

	const message = `Expected ${Stdout.colored("red", received)} to equal ${Stdout.green(expected)}.\n${diff}`;
	return expect(Equal.equals(received, expected), message).toBeTrue();
}
