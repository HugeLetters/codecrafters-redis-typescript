import { describe, expect } from "bun:test";
import { RespError } from "$/resp/error";
import { RawCR, RawLF } from "$/resp/test.utils";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { SimpleError, SimpleString } from "./simple";

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
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $string.decodeFail("invalid");
				yield* expectParseError.withMessage(result, "invalid");
			});

			test.effect(`when contains ${RawCR}`, function* () {
				const result = yield* $string.decodeFail("+O\nK\r\n");
				yield* expectParseError.withMessage(result, "O\\nK");
			});

			test.effect(`when contains ${RawLF}`, function* () {
				const result = yield* $string.decodeFail("+O\rK\r\n");
				yield* expectParseError.withMessage(result, "O\\rK");
			});

			test.effect("with leftover", function* () {
				const result = yield* $string.decodeFail("+OK\r\nleft\r\nover");
				yield* expectParseError.withMessage(result, "left");
			});
		});
	});
});

describe("ErrorFromSimpleString", () => {
	const $error = createSchemaHelpers(SimpleError);

	describe("with valid data", () => {
		const EncodedError = "-Error message\r\n";
		const DecodedError = new RespError({ message: "Error message" });

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
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $error.decodeFail("invalid");
				yield* expectParseError.withMessage(result, "invalid");
			});

			test.effect(`when contains ${RawCR}`, function* () {
				const result = yield* $error.decodeFail("-err\nor\r\n");
				yield* expectParseError.withMessage(result, "err\\nor");
			});

			test.effect(`when contains ${RawLF}`, function* () {
				const result = yield* $error.decodeFail("-err\ror\r\n");
				yield* expectParseError.withMessage(result, "err\\ror");
			});

			test.effect("with leftover", function* () {
				const result = yield* $error.decodeFail("-err\r\nleft\r\nover");
				yield* expectParseError.withMessage(result, "left");
			});
		});
	});
});
