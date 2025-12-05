import { describe, expect } from "bun:test";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { Double } from "./double";

describe("Double", () => {
	const $double = createSchemaHelpers(Double);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for integer", function* () {
				const result = yield* $double.decode(",10\r\n");
				expect(result).toBe(10);
			});

			test.effect("for negative integer", function* () {
				const result = yield* $double.decode(",-10\r\n");
				expect(result).toBe(-10);
			});

			test.effect("for positive integer", function* () {
				const result = yield* $double.decode(",+10\r\n");
				expect(result).toBe(10);
			});

			test.effect("for fractional", function* () {
				const result = yield* $double.decode(",1.023\r\n");
				expect(result).toBe(1.023);
			});

			test.effect("for negative fractional", function* () {
				const result = yield* $double.decode(",-1.023\r\n");
				expect(result).toBe(-1.023);
			});

			test.effect("for positive fractional", function* () {
				const result = yield* $double.decode(",+1.023\r\n");
				expect(result).toBe(1.023);
			});

			test.effect("for exponent", function* () {
				const result = yield* $double.decode(",1.023e10\r\n");
				expect(result).toBe(1.023e10);
			});

			test.effect("for negative exponent", function* () {
				const result = yield* $double.decode(",1.023e-10\r\n");
				expect(result).toBe(1.023e-10);
			});

			test.effect("for positive exponent", function* () {
				const result = yield* $double.decode(",1.023e+10\r\n");
				expect(result).toBe(1.023e10);
			});

			test.effect("for exponent with leading zeroes", function* () {
				const result = yield* $double.decode(",1.023e002\r\n");
				expect(result).toBe(1.023e2);
			});

			test.effect(
				"for exponent with negative sign and leading zeroes",
				function* () {
					const result = yield* $double.decode(",1.023e-002\r\n");
					expect(result).toBe(1.023e-2);
				},
			);

			test.effect("for negative number with negative exponent", function* () {
				const result = yield* $double.decode(",-12.034e-002\r\n");
				expect(result).toBe(-12.034e-2);
			});

			test.effect("for negative number with positive exponent", function* () {
				const result = yield* $double.decode(",-12.034e+002\r\n");
				expect(result).toBe(-12.034e2);
			});

			test.effect("for uppercase E exponent", function* () {
				const result = yield* $double.decode(",1.023E10\r\n");
				expect(result).toBe(1.023e10);
			});

			test.effect("for positive infinity", function* () {
				const result = yield* $double.decode(",inf\r\n");
				expect(result).toBe(Number.POSITIVE_INFINITY);
			});

			test.effect("for negative infinity", function* () {
				const result = yield* $double.decode(",-inf\r\n");
				expect(result).toBe(Number.NEGATIVE_INFINITY);
			});

			test.effect("for NaN", function* () {
				const result = yield* $double.decode(",nan\r\n");
				expect(result).toBeNaN();
			});
		});

		describe("is encoded", () => {
			test.effect("for integer", function* () {
				const result = yield* $double.encode(10);
				expect(result).toBe(",10\r\n");
			});

			test.effect("for negative integer", function* () {
				const result = yield* $double.encode(-10);
				expect(result).toBe(",-10\r\n");
			});

			test.effect("for fractional", function* () {
				const result = yield* $double.encode(1.023);
				expect(result).toBe(",1.023\r\n");
			});

			test.effect("for negative fractional", function* () {
				const result = yield* $double.encode(-1.023);
				expect(result).toBe(",-1.023\r\n");
			});

			test.effect("for exponent", function* () {
				const result = yield* $double.encode(1.23e11);
				expect(result).toBe(",123e9\r\n");
			});

			test.effect("for negative exponent", function* () {
				const result = yield* $double.encode(1.023e-3);
				expect(result).toBe(",1023e-6\r\n");
			});

			test.effect("for negative number with negative exponent", function* () {
				const result = yield* $double.encode(-0.01234e-10);
				expect(result).toBe(",-1234e-15\r\n");
			});

			test.effect("for negative number with positive exponent", function* () {
				const result = yield* $double.encode(-12.34e10);
				expect(result).toBe(",-1234e8\r\n");
			});

			test.effect("for positive infinity", function* () {
				const result = yield* $double.encode(Number.POSITIVE_INFINITY);
				expect(result).toBe(",inf\r\n");
			});

			test.effect("for negative infinity", function* () {
				const result = yield* $double.encode(Number.NEGATIVE_INFINITY);
				expect(result).toBe(",-inf\r\n");
			});

			test.effect("for NaN", function* () {
				const result = yield* $double.encode(Number.NaN);
				expect(result).toBe(",nan\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $double.decodeFail("123");
				yield* expectParseError.withMessage(result, "123");
			});

			test.effect("when doesnt end with crlf", function* () {
				const result = yield* $double.decodeFail(",123");
				yield* expectParseError.withMessage(result, "123");
			});

			test.effect("when has invalid characters", function* () {
				const result = yield* $double.decodeFail(",123a\r\n");
				yield* expectParseError.withMessage(result, "123a");
			});

			test.effect("when missing integral part", function* () {
				const result = yield* $double.decodeFail(",.23\r\n");
				yield* expectParseError.withMessage(result, ".23");
			});

			test.effect("when missing comma prefix", function* () {
				const result = yield* $double.decodeFail("1.23\r\n");
				yield* expectParseError.withMessage(result, "1.23");
			});

			test.effect("with leftover", function* () {
				const result = yield* $double.decodeFail(",1.23e1\r\nleft\r\nover");
				yield* expectParseError.withMessage(result, "left");
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", function* () {
				const result = yield* $double.encodeFail("abc");
				yield* expectParseError.withMessage(result, "abc");
			});

			test.effect("when input is null", function* () {
				const result = yield* $double.encodeFail(null);
				yield* expectParseError.withMessage(result, "null");
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $double.encodeFail(undefined);
				yield* expectParseError.withMessage(result, "undefined");
			});
		});
	});
});
