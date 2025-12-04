import { describe, expect } from "bun:test";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { BigNumber } from "./bigNumber";

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

			test.effect("with leftover", function* () {
				const result = yield* $bigNumber.decodeFail("(123\r\nleft\r\nover");
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
