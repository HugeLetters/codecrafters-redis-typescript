import { describe, expect } from "bun:test";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { BulkString } from "./bulk";

describe("BulkString", () => {
	const $string = createSchemaHelpers(BulkString);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with string", function* () {
				const result = yield* $string.decode("$5\r\nhello\r\n");
				expect(result).toBe("hello");
			});

			test.effect("with empty string", function* () {
				const result = yield* $string.decode("$0\r\n\r\n");
				expect(result).toBe("");
			});

			test.effect("with crlf in string", function* () {
				const result = yield* $string.decode("$12\r\nhello\r\nworld\r\n");
				expect(result).toBe("hello\r\nworld");
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $string.decode("$7\r\n\r\nhello\r\n");
				expect(result).toBe("\r\nhello");
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $string.decode("$7\r\nhello\r\n\r\n");
				expect(result).toBe("hello\r\n");
			});
		});

		describe("is encoded", () => {
			test.effect("with string", function* () {
				const result = yield* $string.encode("hello");
				expect(result).toBe("$5\r\nhello\r\n");
			});

			test.effect("with empty string", function* () {
				const result = yield* $string.encode("");
				expect(result).toBe("$0\r\n\r\n");
			});

			test.effect("with crlf in string", function* () {
				const result = yield* $string.encode("hello\r\nworld");
				expect(result).toBe("$12\r\nhello\r\nworld\r\n");
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $string.encode("\r\nhello");
				expect(result).toBe("$7\r\n\r\nhello\r\n");
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $string.encode("hello\r\n");
				expect(result).toBe("$7\r\nhello\r\n\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $string.decodeFail("invalid");
				expectParseError(result);
			});

			test.effect("when missing data", function* () {
				const result = yield* $string.decodeFail("$5\r\n");
				expectParseError(result);
			});

			test.effect("when missing initial $", function* () {
				const result = yield* $string.decodeFail("5\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("when missing trailing CRLF", function* () {
				const result = yield* $string.decodeFail("$5\r\nhello");
				expectParseError(result);
			});

			test.effect("when length is too short", function* () {
				const result = yield* $string.decodeFail("$10\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("when length is too long", function* () {
				const result = yield* $string.decodeFail("$2\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("when length is incorrect with leftover", function* () {
				const result = yield* $string.decodeFail("$5\r\nhel\r\nleftover");
				expectParseError(result);
			});

			test.effect("when length is negative", function* () {
				const result = yield* $string.decodeFail("$-1\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("when length is not a number", function* () {
				const result = yield* $string.decodeFail("$abc\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $string.decodeFail("$5\r\nhello\r\nleft\r\nover");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is null", function* () {
				const result = yield* $string.encodeFail(null);
				expectParseError(result);
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $string.encodeFail(undefined);
				expectParseError(result);
			});

			test.effect("when input is number", function* () {
				const result = yield* $string.encodeFail(123);
				expectParseError(result);
			});
		});
	});
});
