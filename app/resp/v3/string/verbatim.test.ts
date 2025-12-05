import { describe, expect } from "bun:test";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { VerbatimString, VerbatimStringFromString } from "./verbatim";

describe("VerbatimString", () => {
	const $string = createSchemaHelpers(VerbatimStringFromString);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with string", function* () {
				const result = yield* $string.decode("=9\r\ntxt:hello\r\n");
				const data = new VerbatimString({ encoding: "txt", text: "hello" });
				expect(result).toStrictEqual(data);
			});

			test.effect("with empty string", function* () {
				const result = yield* $string.decode("=4\r\ntxt:\r\n");
				const data = new VerbatimString({ encoding: "txt", text: "" });
				expect(result).toStrictEqual(data);
			});

			test.effect("with crlf in string", function* () {
				const result = yield* $string.decode("=16\r\ntxt:hello\r\nworld\r\n");
				const data = new VerbatimString({
					encoding: "txt",
					text: "hello\r\nworld",
				});
				expect(result).toStrictEqual(data);
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $string.decode("=11\r\ntxt:\r\nhello\r\n");
				const data = new VerbatimString({ encoding: "txt", text: "\r\nhello" });
				expect(result).toStrictEqual(data);
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $string.decode("=11\r\ntxt:hello\r\n\r\n");
				const data = new VerbatimString({ encoding: "txt", text: "hello\r\n" });
				expect(result).toStrictEqual(data);
			});
		});

		describe("is encoded", () => {
			test.effect("with string", function* () {
				const data = new VerbatimString({ encoding: "txt", text: "hello" });
				const result = yield* $string.encode(data);
				expect(result).toBe("=9\r\ntxt:hello\r\n");
			});

			test.effect("with empty string", function* () {
				const data = new VerbatimString({ encoding: "txt", text: "" });
				const result = yield* $string.encode(data);
				expect(result).toBe("=4\r\ntxt:\r\n");
			});

			test.effect("with crlf in string", function* () {
				const data = new VerbatimString({
					encoding: "txt",
					text: "hello\r\nworld",
				});
				const result = yield* $string.encode(data);
				expect(result).toBe("=16\r\ntxt:hello\r\nworld\r\n");
			});

			test.effect("with crlf at start", function* () {
				const data = new VerbatimString({ encoding: "txt", text: "\r\nhello" });
				const result = yield* $string.encode(data);
				expect(result).toBe("=11\r\ntxt:\r\nhello\r\n");
			});

			test.effect("with crlf at end", function* () {
				const data = new VerbatimString({ encoding: "txt", text: "hello\r\n" });
				const result = yield* $string.encode(data);
				expect(result).toBe("=11\r\ntxt:hello\r\n\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $string.decodeFail("invalid");
				yield* expectParseError.withMessage(result, "invalid");
			});

			test.effect("when length is too short", function* () {
				const result = yield* $string.decodeFail("=10\r\ntxt:hello\r\n");
				yield* expectParseError.withMessage(result, "10");
			});

			test.effect("when length is too long", function* () {
				const result = yield* $string.decodeFail("=8\r\ntxt:hello\r\n");
				yield* expectParseError.withMessage(result, "8");
			});

			test.effect("when missing data", function* () {
				const result = yield* $string.decodeFail("=15\r\n");
				yield* expectParseError.withMessage(result, "15");
			});

			test.effect("when missing initial =", function* () {
				const result = yield* $string.decodeFail("9\r\ntxt:hello\r\n");
				yield* expectParseError.withMessage(result, "9");
			});

			test.effect("when missing trailing CRLF", function* () {
				const result = yield* $string.decodeFail("=9\r\ntxt:hello");
				yield* expectParseError.withMessage(result, "9");
			});

			test.effect("when encoding is not 3 chars", function* () {
				const result = yield* $string.decodeFail("=10\r\ntext:hello\r\n");
				yield* expectParseError.withMessage(result, "text");
			});

			test.effect("when missing colon", function* () {
				const result = yield* $string.decodeFail("=8\r\ntxthello\r\n");
				yield* expectParseError.withMessage(result, "txthello");
			});

			test.effect("with leftover", function* () {
				const result = yield* $string.decodeFail(
					"=9\r\ntxt:hello\r\nleft\r\nover",
				);
				yield* expectParseError.withMessage(result, "left");
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is null", function* () {
				const result = yield* $string.encodeFail(null);
				yield* expectParseError.withMessage(result, "null");
			});

			test.effect("when input is undefined", function* () {
				const result = yield* $string.encodeFail(undefined);
				yield* expectParseError.withMessage(result, "undefined");
			});

			test.effect("when input is number", function* () {
				const result = yield* $string.encodeFail(123);
				yield* expectParseError.withMessage(result, "123");
			});
		});
	});
});
