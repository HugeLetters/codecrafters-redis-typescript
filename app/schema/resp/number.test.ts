import { Integer as IntSchema } from "$/schema/number";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { BigNumber, Double, Integer } from "./number";

describe("Integer", () => {
	const $int = createSchemaHelpers(Integer);
	const i = IntSchema.make;

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for integer", function* () {
				const result = yield* $int.decode(":1000\r\n");
				expect(result).toBe(i(1000));
			});

			test.effect("for negative", function* () {
				const result = yield* $int.decode(":-1000\r\n");
				expect(result).toBe(i(-1000));
			});

			test.effect("for positive", function* () {
				const result = yield* $int.decode(":+1000\r\n");
				expect(result).toBe(i(1000));
			});

			test.effect("for 0", function* () {
				const result = yield* $int.decode(":0\r\n");
				expect(result).toBe(i(0));
			});

			test.effect("for -0", function* () {
				const result = yield* $int.decode(":-0\r\n");
				expect(result).toBe(i(-0));
			});

			test.effect("for +0", function* () {
				const result = yield* $int.decode(":+0\r\n");
				expect(result).toBe(i(0));
			});
		});

		describe("is encoded", () => {
			test.effect("for positive", function* () {
				const result = yield* $int.encode(i(1000));
				expect(result).toBe(":1000\r\n");
			});

			test.effect("for negative", function* () {
				const result = yield* $int.encode(i(-1000));
				expect(result).toBe(":-1000\r\n");
			});

			test.effect("for 0", function* () {
				const result = yield* $int.encode(i(0));
				expect(result).toBe(":0\r\n");
			});

			test.effect("for -0", function* () {
				const result = yield* $int.encode(i(-0));
				expect(result).toBe(":0\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $int.decodeFail("123");
				expectParseError(result);
			});

			test.effect("when doesnt end with crlf", function* () {
				const result = yield* $int.decodeFail(":123");
				expectParseError(result);
			});

			test.effect("when has invalid characters", function* () {
				const result = yield* $int.decodeFail(":123a\r\n");
				expectParseError(result);
			});

			test.effect("when is decimal", function* () {
				const result = yield* $int.decodeFail(":123.45\r\n");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $int.decodeFail(":123\r\nleft\r\nover");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", function* () {
				const result = yield* $int.encodeFail("abc");
				expectParseError(result);
			});

			test.effect("when input is null", function* () {
				const result = yield* $int.encodeFail(null);
				expectParseError(result);
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $int.encodeFail(undefined);
				expectParseError(result);
			});

			test.effect("when input is decimal", function* () {
				const result = yield* $int.encodeFail(123.45);
				expectParseError(result);
			});
		});
	});
});

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
				expectParseError(result);
			});

			test.effect("when doesnt end with crlf", function* () {
				const result = yield* $double.decodeFail(",123");
				expectParseError(result);
			});

			test.effect("when has invalid characters", function* () {
				const result = yield* $double.decodeFail(",123a\r\n");
				expectParseError(result);
			});

			test.effect("when missing integral part", function* () {
				const result = yield* $double.decodeFail(",.23\r\n");
				expectParseError(result);
			});

			test.effect("when missing comma prefix", function* () {
				const result = yield* $double.decodeFail("1.23\r\n");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $double.decodeFail(",1.23e1\r\nleft\r\nover");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", function* () {
				const result = yield* $double.encodeFail("abc");
				expectParseError(result);
			});

			test.effect("when input is null", function* () {
				const result = yield* $double.encodeFail(null);
				expectParseError(result);
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $double.encodeFail(undefined);
				expectParseError(result);
			});
		});
	});
});

describe("BigNumber", () => {
	const $bigNumber = createSchemaHelpers(BigNumber);
	const BigIntValue = 3492890328409238509324850943850943825024385n;

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for positive bigint", function* () {
				const result = yield* $bigNumber.decode(`(${BigIntValue}\r\n`);
				expect(result).toBe(BigIntValue);
			});

			test.effect("for negative bigint", function* () {
				const result = yield* $bigNumber.decode(`(-${BigIntValue}\r\n`);
				expect(result).toBe(-BigIntValue);
			});

			test.effect("for zero", function* () {
				const result = yield* $bigNumber.decode("(0\r\n");
				expect(result).toBe(0n);
			});

			test.effect("for positive zero", function* () {
				const result = yield* $bigNumber.decode("(+0\r\n");
				expect(result).toBe(0n);
			});

			test.effect("for negative zero", function* () {
				const result = yield* $bigNumber.decode("(-0\r\n");
				expect(result).toBe(0n);
			});
		});

		describe("is encoded", () => {
			test.effect("for positive bigint", function* () {
				const result = yield* $bigNumber.encode(BigIntValue);
				expect(result).toBe(`(${BigIntValue}\r\n`);
			});

			test.effect("for negative bigint", function* () {
				const result = yield* $bigNumber.encode(-BigIntValue);
				expect(result).toBe(`(-${BigIntValue}\r\n`);
			});

			test.effect("for zero", function* () {
				const result = yield* $bigNumber.encode(0n);
				expect(result).toBe("(0\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $bigNumber.decodeFail("123");
				expectParseError(result);
			});

			test.effect("when doesnt end with crlf", function* () {
				const result = yield* $bigNumber.decodeFail("(123");
				expectParseError(result);
			});

			test.effect("when has invalid characters", function* () {
				const result = yield* $bigNumber.decodeFail("(123a\r\n");
				expectParseError(result);
			});

			test.effect("when is decimal", function* () {
				const result = yield* $bigNumber.decodeFail("(123.45\r\n");
				expectParseError(result);
			});

			test.effect("when missing parenthesis", function* () {
				const result = yield* $bigNumber.decodeFail("123\r\n");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", function* () {
				const result = yield* $bigNumber.encodeFail("abc");
				expectParseError(result);
			});

			test.effect("when input is null", function* () {
				const result = yield* $bigNumber.encodeFail(null);
				expectParseError(result);
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $bigNumber.encodeFail(undefined);
				expectParseError(result);
			});

			test.effect("when input is decimal", function* () {
				const result = yield* $bigNumber.encodeFail(123.45);
				expectParseError(result);
			});
		});
	});
});
