import { describe, expect } from "bun:test";
import { RespError } from "$/resp/error";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { BulkError } from "./bulk";

describe("ErrorFromBulkString", () => {
	const $error = createSchemaHelpers(BulkError);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with error message", function* () {
				const result = yield* $error.decode("!5\r\nerror\r\n");
				expect(result).toStrictEqual(new RespError({ message: "error" }));
			});

			test.effect("with empty error message", function* () {
				const result = yield* $error.decode("!0\r\n\r\n");
				expect(result).toStrictEqual(new RespError({ message: "" }));
			});

			test.effect("with crlf in error message", function* () {
				const result = yield* $error.decode("!12\r\nhello\r\nworld\r\n");
				expect(result).toStrictEqual(
					new RespError({ message: "hello\r\nworld" }),
				);
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $error.decode("!7\r\n\r\nerror\r\n");
				expect(result).toStrictEqual(new RespError({ message: "\r\nerror" }));
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $error.decode("!7\r\nerror\r\n\r\n");
				expect(result).toStrictEqual(new RespError({ message: "error\r\n" }));
			});
		});

		describe("is encoded", () => {
			test.effect("with error message", function* () {
				const error = new RespError({ message: "error" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!5\r\nerror\r\n");
			});

			test.effect("with empty error message", function* () {
				const error = new RespError({ message: "" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!0\r\n\r\n");
			});

			test.effect("with crlf in error message", function* () {
				const error = new RespError({ message: "hello\r\nworld" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!12\r\nhello\r\nworld\r\n");
			});

			test.effect("with crlf at start", function* () {
				const error = new RespError({ message: "\r\nhello" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!7\r\n\r\nhello\r\n");
			});

			test.effect("with crlf at end", function* () {
				const error = new RespError({ message: "error\r\n" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!7\r\nerror\r\n\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $error.decodeFail("invalid");
				yield* expectParseError.withMessage(result, "invalid");
			});

			test.effect("when length is too short", function* () {
				const result = yield* $error.decodeFail("!6\r\nerror\r\n");
				yield* expectParseError.withMessage(result, "6");
			});

			test.effect("when length is too long", function* () {
				const result = yield* $error.decodeFail("!4\r\nerror\r\n");
				yield* expectParseError.withMessage(result, "4");
			});

			test.effect("when missing data", function* () {
				const result = yield* $error.decodeFail("!21\r\n");
				yield* expectParseError.withMessage(result, "21");
			});

			test.effect("when missing initial !", function* () {
				const result = yield* $error.decodeFail("5\r\nerror\r\n");
				yield* expectParseError.withMessage(result, "5");
			});

			test.effect("when missing trailing CRLF", function* () {
				const result = yield* $error.decodeFail("!5\r\nerror");
				yield* expectParseError.withMessage(result, "5");
			});

			test.effect("when length is negative", function* () {
				const result = yield* $error.decodeFail("!-1\r\nerror\r\n");
				yield* expectParseError.withMessage(result, "-1");
			});

			test.effect("when length is not a number", function* () {
				const result = yield* $error.decodeFail("!abc\r\nerror\r\n");
				yield* expectParseError.withMessage(result, "abc");
			});

			test.effect("with leftover", function* () {
				const result = yield* $error.decodeFail("!5\r\nerror\r\nleft\r\nover");
				yield* expectParseError.withMessage(result, "left");
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is null", function* () {
				const result = yield* $error.encodeFail(null);
				yield* expectParseError.withMessage(result, "null");
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $error.encodeFail(undefined);
				yield* expectParseError.withMessage(result, "undefined");
			});

			test.effect("when input is number", function* () {
				const result = yield* $error.encodeFail(123);
				yield* expectParseError.withMessage(result, "123");
			});
		});
	});
});
