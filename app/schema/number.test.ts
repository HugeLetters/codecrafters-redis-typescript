import { describe, expect } from "bun:test";
import * as BigDecimal from "effect/BigDecimal";
import * as Fn from "effect/Function";

import { expectEquivalence, test } from "$/test";
import { Fraction, FractionFromDigitString } from "./number";
import { createSchemaHelpers, expectParseError } from "./test";

describe("FractionFromDigitString", () => {
	const $fraction = createSchemaHelpers(FractionFromDigitString);
	const f = Fn.flow(BigDecimal.unsafeFromNumber, Fraction.make);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for normal digits", function* () {
				const result = yield* $fraction.decode("25");
				expectEquivalence(result, f(0.25));
			});

			test.effect("for leading zeros", function* () {
				const result = yield* $fraction.decode("0025");
				expectEquivalence(result, f(0.0025));
			});

			test.effect("for many leading zeros", function* () {
				const result = yield* $fraction.decode(`${"0".repeat(100)}25`);
				expectEquivalence(result, f(0.25e-100));
			});

			test.effect("for zero", function* () {
				const result = yield* $fraction.decode("0");
				expectEquivalence(result, f(0));
			});
		});

		describe("is encoded", () => {
			test.effect("for normal fraction", function* () {
				const result = yield* $fraction.encode(f(0.25));
				expect(result).toBe("25");
			});

			test.effect("for small fraction", function* () {
				const result = yield* $fraction.encode(f(0.0025));
				expect(result).toBe("0025");
			});

			test.effect("for very small fraction", function* () {
				const result = yield* $fraction.encode(f(0.25e-100));
				expect(result).toBe(`${"0".repeat(100)}25`);
			});

			test.effect("for zero", function* () {
				const result = yield* $fraction.encode(f(0));
				expect(result).toBe("0");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("for non-digit string", function* () {
				const result = yield* $fraction.decodeFail("abc");
				expectParseError(result);
			});

			test.effect("for empty string", function* () {
				const result = yield* $fraction.decodeFail("");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("for number >= 1", function* () {
				const result = yield* $fraction.encodeFail(1.25);
				expectParseError(result);
			});

			test.effect("for negative number", function* () {
				const result = yield* $fraction.encodeFail(-0.25);
				expectParseError(result);
			});

			test.effect("for string", function* () {
				const result = yield* $fraction.encodeFail("25");
				expectParseError(result);
			});
		});
	});
});
