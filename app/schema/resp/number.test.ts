import { Integer as IntSchema } from "$/schema/number";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Effect } from "effect";
import { Integer, Double } from "./number";
import { createSchemaHelpers, expectParseError } from "../test";

describe("Integer", () => {
	const $int = createSchemaHelpers(Integer);
	const i = IntSchema.make;

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for integer", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":1000\r\n");
					expect(result).toBe(i(1000));
				});
			});

			test.effect("for negative", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":-1000\r\n");
					expect(result).toBe(i(-1000));
				});
			});

			test.effect("for positive", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":+1000\r\n");
					expect(result).toBe(i(1000));
				});
			});

			test.effect("for 0", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":0\r\n");
					expect(result).toBe(i(0));
				});
			});

			test.effect("for -0", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":-0\r\n");
					expect(result).toBe(i(-0));
				});
			});

			test.effect("for +0", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decode(":+0\r\n");
					expect(result).toBe(i(0));
				});
			});
		});

		describe("is encoded", () => {
			test.effect("for positive", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encode(i(1000));
					expect(result).toBe(":1000\r\n");
				});
			});

			test.effect("for negative", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encode(i(-1000));
					expect(result).toBe(":-1000\r\n");
				});
			});

			test.effect("for 0", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encode(i(0));
					expect(result).toBe(":0\r\n");
				});
			});

			test.effect("for -0", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encode(i(-0));
					expect(result).toBe(":-0\r\n");
				});
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decodeFail("123");
					expectParseError(result);
				});
			});

			test.effect("when doesnt end with crlf", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decodeFail(":123");
					expectParseError(result);
				});
			});

			test.effect("when has invalid characters", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decodeFail(":123a\r\n");
					expectParseError(result);
				});
			});

			test.effect("when is decimal", () => {
				return Effect.gen(function* () {
					const result = yield* $int.decodeFail(":123.45\r\n");
					expectParseError(result);
				});
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encodeFail("abc");
					expectParseError(result);
				});
			});

			test.effect("when input is null", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encodeFail(null);
					expectParseError(result);
				});
			});

			test.effect("when input is undefined", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encodeFail(undefined);
					expectParseError(result);
				});
			});

			test.effect("when input is decimal", () => {
				return Effect.gen(function* () {
					const result = yield* $int.encodeFail(123.45);
					expectParseError(result);
				});
			});
		});
	});
});

describe("Double", () => {
	const $double = createSchemaHelpers(Double);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for integer", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",10\r\n");
					expect(result).toBe(10);
				});
			});

			test.effect("for negative integer", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",-10\r\n");
					expect(result).toBe(-10);
				});
			});

			test.effect("for positive integer with explicit sign", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",+10\r\n");
					expect(result).toBe(10);
				});
			});

			test.effect("for fractional", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",1.23\r\n");
					expect(result).toBe(1.23);
				});
			});

			test.effect("for negative fractional", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",-1.23\r\n");
					expect(result).toBe(-1.23);
				});
			});

			test.effect("for positive fractional with explicit sign", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",+1.23\r\n");
					expect(result).toBe(1.23);
				});
			});

			test.effect("for exponent", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",1.23e2\r\n");
					expect(result).toBe(123);
				});
			});

			test.effect("for negative exponent", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",1.23e-2\r\n");
					expect(result).toBe(0.0123);
				});
			});

			test.effect("for positive exponent with explicit sign", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",1.23e+2\r\n");
					expect(result).toBe(123);
				});
			});

			test.effect("for uppercase E exponent", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",1.23E2\r\n");
					expect(result).toBe(123);
				});
			});

			test.effect("for positive infinity", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",inf\r\n");
					expect(result).toBe(Number.POSITIVE_INFINITY);
				});
			});

			test.effect("for negative infinity", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",-inf\r\n");
					expect(result).toBe(Number.NEGATIVE_INFINITY);
				});
			});

			test.effect("for NaN", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decode(",nan\r\n");
					expect(Number.isNaN(result)).toBe(true);
				});
			});
		});

		describe("is encoded", () => {
			test.effect("for integer", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(10);
					expect(result).toBe(",10\r\n");
				});
			});

			test.effect("for negative integer", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(-10);
					expect(result).toBe(",-10\r\n");
				});
			});

			test.effect("for fractional", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(1.23);
					expect(result).toBe(",1.23\r\n");
				});
			});

			test.effect("for negative fractional", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(-1.23);
					expect(result).toBe(",-1.23\r\n");
				});
			});

			test.effect("for exponent", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(123 ** 100);
					expect(result).toBe(",123e100\r\n");
				});
			});

			test.effect("for positive infinity", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(Number.POSITIVE_INFINITY);
					expect(result).toBe(",inf\r\n");
				});
			});

			test.effect("for negative infinity", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(Number.NEGATIVE_INFINITY);
					expect(result).toBe(",-inf\r\n");
				});
			});

			test.effect("for NaN", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encode(Number.NaN);
					expect(result).toBe(",nan\r\n");
				});
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decodeFail("123");
					expectParseError(result);
				});
			});

			test.effect("when doesnt end with crlf", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decodeFail(",123");
					expectParseError(result);
				});
			});

			test.effect("when has invalid characters", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decodeFail(",123a\r\n");
					expectParseError(result);
				});
			});

			test.effect("when missing integral part", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decodeFail(",.23\r\n");
					expectParseError(result);
				});
			});

			test.effect("when missing comma prefix", () => {
				return Effect.gen(function* () {
					const result = yield* $double.decodeFail("1.23\r\n");
					expectParseError(result);
				});
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encodeFail("abc");
					expectParseError(result);
				});
			});

			test.effect("when input is null", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encodeFail(null);
					expectParseError(result);
				});
			});

			test.effect("when input is undefined", () => {
				return Effect.gen(function* () {
					const result = yield* $double.encodeFail(undefined);
					expectParseError(result);
				});
			});
		});
	});
});
