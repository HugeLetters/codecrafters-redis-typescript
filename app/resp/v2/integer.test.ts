import { describe, expect } from "bun:test";
import { Integer as IntSchema } from "$/schema/number";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { Integer } from "./integer";

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
				yield* expectParseError.withMessage(result, "123");
			});

			test.effect("when doesnt end with crlf", function* () {
				const result = yield* $int.decodeFail(":123");
				yield* expectParseError.withMessage(result, "123");
			});

			test.effect("when has invalid characters", function* () {
				const result = yield* $int.decodeFail(":123a\r\n");
				yield* expectParseError.withMessage(result, "123a");
			});

			test.effect("when is decimal", function* () {
				const result = yield* $int.decodeFail(":123.45\r\n");
				yield* expectParseError.withMessage(result, "123.45");
			});

			test.effect("with leftover", function* () {
				const result = yield* $int.decodeFail(":123\r\nleft\r\nover");
				yield* expectParseError.withMessage(result, "left");
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is string", function* () {
				const result = yield* $int.encodeFail("abc");
				yield* expectParseError.withMessage(result, "abc");
			});

			test.effect("when input is null", function* () {
				const result = yield* $int.encodeFail(null);
				yield* expectParseError.withMessage(result, "null");
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $int.encodeFail(undefined);
				yield* expectParseError.withMessage(result, "undefined");
			});

			test.effect("when input is decimal", function* () {
				const result = yield* $int.encodeFail(123.45);
				yield* expectParseError.withMessage(result, "123.45");
			});
		});
	});
});
