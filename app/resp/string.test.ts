import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Effect } from "effect";
import { SimpleError, SimpleErrorFromString, SimpleString } from "./string";
import { createSchemaHelpers, expectParseError } from "./test";

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
