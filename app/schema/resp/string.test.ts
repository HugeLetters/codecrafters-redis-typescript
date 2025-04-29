import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import {
	BulkString,
	ErrorFromBulkString,
	ErrorFromSimpleString,
	Error_,
	SimpleString,
	VerbatimString,
} from "./string";

describe("SimpleString", () => {
	const $string = createSchemaHelpers(SimpleString);

	describe("with valid data", () => {
		const EncodedString = "+string\r\n";
		const DecodedString = "string";

		test.effect("is decoded", function* () {
			const result = yield* $string.decode(EncodedString);
			expect(result).toBe(DecodedString);
		});

		test.effect("is encoded", function* () {
			const result = yield* $string.encode(DecodedString);
			expect(result).toBe(EncodedString);
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded when doesnt conform to schema", function* () {
			const result = yield* $string.decodeFail("invalid");
			expectParseError(result);
		});

		test.effect("is not decoded when contains \\r", function* () {
			const result = yield* $string.decodeFail("+O\nK\r\n");
			expectParseError(result);
		});

		test.effect("is not decoded when contains \\n", function* () {
			const result = yield* $string.decodeFail("+O\rK\r\n");
			expectParseError(result);
		});
	});
});

describe("ErrorFromSimpleString", () => {
	const $error = createSchemaHelpers(ErrorFromSimpleString);

	describe("with valid data", () => {
		const EncodedError = "-Error message\r\n";
		const DecodedError = new Error_({ message: "Error message" });

		test.effect("is decoded", function* () {
			const result = yield* $error.decode(EncodedError);
			expect(result).toStrictEqual(DecodedError);
		});

		test.effect("is encoded", function* () {
			const result = yield* $error.encode(DecodedError);
			expect(result).toBe(EncodedError);
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded when doesnt conform to schema", function* () {
			const result = yield* $error.decodeFail("invalid");
			expectParseError(result);
		});

		test.effect("is not decoded when contains \\r", function* () {
			const result = yield* $error.decodeFail("-err\nor\r\n");
			expectParseError(result);
		});

		test.effect("is not decoded when contains \\n", function* () {
			const result = yield* $error.decodeFail("-err\ror\r\n");
			expectParseError(result);
		});
	});
});

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

			test.effect("when length is incorrect", function* () {
				const result = yield* $string.decodeFail("$5\r\nhel\r\n");
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

			test.effect("when length is negative", function* () {
				const result = yield* $string.decodeFail("$-1\r\nhello\r\n");
				expectParseError(result);
			});

			test.effect("when length is not a number", function* () {
				const result = yield* $string.decodeFail("$abc\r\nhello\r\n");
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

describe("ErrorFromBulkString", () => {
	const $error = createSchemaHelpers(ErrorFromBulkString);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with error message", function* () {
				const result = yield* $error.decode("!5\r\nerror\r\n");
				expect(result).toStrictEqual(new Error_({ message: "error" }));
			});

			test.effect("with empty error message", function* () {
				const result = yield* $error.decode("!0\r\n\r\n");
				expect(result).toStrictEqual(new Error_({ message: "" }));
			});

			test.effect("with crlf in error message", function* () {
				const result = yield* $error.decode("!12\r\nhello\r\nworld\r\n");
				expect(result).toStrictEqual(new Error_({ message: "hello\r\nworld" }));
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $error.decode("!7\r\n\r\nerror\r\n");
				expect(result).toStrictEqual(new Error_({ message: "\r\nerror" }));
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $error.decode("!7\r\nerror\r\n\r\n");
				expect(result).toStrictEqual(new Error_({ message: "error\r\n" }));
			});
		});

		describe("is encoded", () => {
			test.effect("with error message", function* () {
				const error = new Error_({ message: "error" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!5\r\nerror\r\n");
			});

			test.effect("with empty error message", function* () {
				const error = new Error_({ message: "" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!0\r\n\r\n");
			});

			test.effect("with crlf in error message", function* () {
				const error = new Error_({ message: "hello\r\nworld" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!12\r\nhello\r\nworld\r\n");
			});

			test.effect("with crlf at start", function* () {
				const error = new Error_({ message: "\r\nhello" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!7\r\n\r\nhello\r\n");
			});

			test.effect("with crlf at end", function* () {
				const error = new Error_({ message: "error\r\n" });
				const result = yield* $error.encode(error);
				expect(result).toBe("!7\r\nerror\r\n\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $error.decodeFail("invalid");
				expectParseError(result);
			});

			test.effect("when length is incorrect", function* () {
				const result = yield* $error.decodeFail("!6\r\nerror\r\n");
				expectParseError(result);
			});

			test.effect("when missing data", function* () {
				const result = yield* $error.decodeFail("!21\r\n");
				expectParseError(result);
			});

			test.effect("when missing initial !", function* () {
				const result = yield* $error.decodeFail("5\r\nerror\r\n");
				expectParseError(result);
			});

			test.effect("when missing trailing CRLF", function* () {
				const result = yield* $error.decodeFail("!21\r\nerror");
				expectParseError(result);
			});

			test.effect("when length is negative", function* () {
				const result = yield* $error.decodeFail("!-1\r\nerror\r\n");
				expectParseError(result);
			});

			test.effect("when length is not a number", function* () {
				const result = yield* $error.decodeFail("!abc\r\nerror\r\n");
				expectParseError(result);
			});
		});
	});
});

describe("VerbatimString", () => {
	const $string = createSchemaHelpers(VerbatimString);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with string", function* () {
				const result = yield* $string.decode("=9\r\ntxt:hello\r\n");
				expect(result).toStrictEqual({ encoding: "txt", text: "hello" });
			});

			test.effect("with empty string", function* () {
				const result = yield* $string.decode("=4\r\ntxt:\r\n");
				expect(result).toStrictEqual({ encoding: "txt", text: "" });
			});

			test.effect("with crlf in string", function* () {
				const result = yield* $string.decode("=16\r\ntxt:hello\r\nworld\r\n");
				expect(result).toStrictEqual({
					encoding: "txt",
					text: "hello\r\nworld",
				});
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $string.decode("=11\r\ntxt:\r\nhello\r\n");
				expect(result).toStrictEqual({ encoding: "txt", text: "\r\nhello" });
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $string.decode("=11\r\ntxt:hello\r\n\r\n");
				expect(result).toStrictEqual({ encoding: "txt", text: "hello\r\n" });
			});
		});

		describe("is encoded", () => {
			test.effect("with string", function* () {
				const result = yield* $string.encode({
					encoding: "txt",
					text: "hello",
				});
				expect(result).toBe("=9\r\ntxt:hello\r\n");
			});

			test.effect("with empty string", function* () {
				const result = yield* $string.encode({ encoding: "txt", text: "" });
				expect(result).toBe("=4\r\ntxt:\r\n");
			});

			test.effect("with crlf in string", function* () {
				const result = yield* $string.encode({
					encoding: "txt",
					text: "hello\r\nworld",
				});
				expect(result).toBe("=16\r\ntxt:hello\r\nworld\r\n");
			});

			test.effect("with crlf at start", function* () {
				const result = yield* $string.encode({
					encoding: "txt",
					text: "\r\nhello",
				});
				expect(result).toBe("=11\r\ntxt:\r\nhello\r\n");
			});

			test.effect("with crlf at end", function* () {
				const result = yield* $string.encode({
					encoding: "txt",
					text: "hello\r\n",
				});
				expect(result).toBe("=11\r\ntxt:hello\r\n\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $string.decodeFail("invalid");
				expectParseError(result);
			});

			test.effect("when length is incorrect", function* () {
				const result = yield* $string.decodeFail("=8\r\ntxt:hello\r\n");
				expectParseError(result);
			});

			test.effect("when missing data", function* () {
				const result = yield* $string.decodeFail("=15\r\n");
				expectParseError(result);
			});

			test.effect("when missing initial =", function* () {
				const result = yield* $string.decodeFail("9\r\ntxt:hello\r\n");
				expectParseError(result);
			});

			test.effect("when missing trailing CRLF", function* () {
				const result = yield* $string.decodeFail("=9\r\ntxt:hello");
				expectParseError(result);
			});

			test.effect("when encoding is not 3 chars", function* () {
				const result = yield* $string.decodeFail("=10\r\ntext:hello\r\n");
				expectParseError(result);
			});

			test.effect("when missing colon", function* () {
				const result = yield* $string.decodeFail("=8\r\ntxthello\r\n");
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
