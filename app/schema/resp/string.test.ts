import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Effect } from "effect";
import {
	SimpleError,
	SimpleErrorFromString,
	SimpleString,
	BulkString,
} from "./string";
import { createSchemaHelpers, expectParseError } from "../test";

describe("SimpleString", () => {
	const $string = createSchemaHelpers(SimpleString);

	describe("with valid data", () => {
		const EncodedString = "+string\r\n";
		const DecodedString = "string";

		test.effect("is decoded", () => {
			return Effect.gen(function* () {
				const result = yield* $string.decode(EncodedString);
				expect(result).toBe(DecodedString);
			});
		});

		test.effect("is encoded", () => {
			return Effect.gen(function* () {
				const result = yield* $string.encode(DecodedString);
				expect(result).toBe(EncodedString);
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded when doesnt conform to schema", () => {
			return Effect.gen(function* () {
				const result = yield* $string.decodeFail("invalid");
				expectParseError(result);
			});
		});

		test.effect("is not decoded when contains \\r", () => {
			return Effect.gen(function* () {
				const result = yield* $string.decodeFail("+O\nK\r\n");
				expectParseError(result);
			});
		});

		test.effect("is not decoded when contains \\n", () => {
			return Effect.gen(function* () {
				const result = yield* $string.decodeFail("+O\rK\r\n");
				expectParseError(result);
			});
		});
	});
});

describe("SimpleErrorFromString", () => {
	const $error = createSchemaHelpers(SimpleErrorFromString);

	describe("with valid data", () => {
		const EncodedError = "-Error message\r\n";
		const DecodedError = new SimpleError({ message: "Error message" });

		test.effect("is decoded", () => {
			return Effect.gen(function* () {
				const result = yield* $error.decode(EncodedError);
				expect(result).toStrictEqual(DecodedError);
			});
		});

		test.effect("is encoded", () => {
			return Effect.gen(function* () {
				const result = yield* $error.encode(DecodedError);
				expect(result).toBe(EncodedError);
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded when doesnt conform to schema", () => {
			return Effect.gen(function* () {
				const result = yield* $error.decodeFail("invalid");
				expectParseError(result);
			});
		});

		test.effect("is not decoded when contains \\r", () => {
			return Effect.gen(function* () {
				const result = yield* $error.decodeFail("-err\nor\r\n");
				expectParseError(result);
			});
		});

		test.effect("is not decoded when contains \\n", () => {
			return Effect.gen(function* () {
				const result = yield* $error.decodeFail("-err\ror\r\n");
				expectParseError(result);
			});
		});
	});
});

describe("BulkString", () => {
	const $string = createSchemaHelpers(BulkString);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("with string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decode("$5\r\nhello\r\n");
					expect(result).toBe("hello");
				});
			});

			test.effect("with empty string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decode("$0\r\n\r\n");
					expect(result).toBe("");
				});
			});

			test.effect("with crlf in string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decode("$12\r\nhello\r\nworld\r\n");
					expect(result).toBe("hello\r\nworld");
				});
			});

			test.effect("with crlf at start", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decode("$7\r\n\r\nhello\r\n");
					expect(result).toBe("\r\nhello");
				});
			});

			test.effect("with crlf at end", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decode("$7\r\nhello\r\n\r\n");
					expect(result).toBe("hello\r\n");
				});
			});
		});

		describe("is encoded", () => {
			test.effect("with string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encode("hello");
					expect(result).toBe("$5\r\nhello\r\n");
				});
			});

			test.effect("with empty string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encode("");
					expect(result).toBe("$0\r\n\r\n");
				});
			});

			test.effect("with crlf in string", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encode("hello\r\nworld");
					expect(result).toBe("$12\r\nhello\r\nworld\r\n");
				});
			});

			test.effect("with crlf at start", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encode("\r\nhello");
					expect(result).toBe("$7\r\n\r\nhello\r\n");
				});
			});

			test.effect("with crlf at end", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encode("hello\r\n");
					expect(result).toBe("$7\r\nhello\r\n\r\n");
				});
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("invalid");
					expectParseError(result);
				});
			});

			test.effect("when length is incorrect", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("$5\r\nhel\r\n");
					expectParseError(result);
				});
			});

			test.effect("when missing data", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("$5\r\n");
					expectParseError(result);
				});
			});

			test.effect("when missing initial $", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("5\r\nhello\r\n");
					expectParseError(result);
				});
			});

			test.effect("when missing trailing CRLF", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("$5\r\nhello");
					expectParseError(result);
				});
			});

			test.effect("when length is negative", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("$-1\r\nhello\r\n");
					expectParseError(result);
				});
			});

			test.effect("when length is not a number", () => {
				return Effect.gen(function* () {
					const result = yield* $string.decodeFail("$abc\r\nhello\r\n");
					expectParseError(result);
				});
			});
		});

		describe("is not encoded", () => {
			test.effect("when input is null", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encodeFail(null);
					expectParseError(result);
				});
			});

			test.effect("when input is undefined", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encodeFail(undefined);
					expectParseError(result);
				});
			});

			test.effect("when input is number", () => {
				return Effect.gen(function* () {
					const result = yield* $string.encodeFail(123);
					expectParseError(result);
				});
			});
		});
	});
});
