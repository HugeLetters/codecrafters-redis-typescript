import { RawCR, RawLF } from "$/schema/resp/constants";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Error_ } from "../error";
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
				expectParseError(result);
			});

			test.effect(`when contains ${RawCR}`, function* () {
				const result = yield* $string.decodeFail("+O\nK\r\n");
				expectParseError(result);
			});

			test.effect(`when contains ${RawLF}`, function* () {
				const result = yield* $string.decodeFail("+O\rK\r\n");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $string.decodeFail("+OK\r\nleft\r\nover");
				expectParseError(result);
			});
		});
	});
});

describe("ErrorFromSimpleString", () => {
	const $error = createSchemaHelpers(SimpleError);

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
		describe("is not decoded", () => {
			test.effect("when doesnt conform to schema", function* () {
				const result = yield* $error.decodeFail("invalid");
				expectParseError(result);
			});

			test.effect(`when contains ${RawCR}`, function* () {
				const result = yield* $error.decodeFail("-err\nor\r\n");
				expectParseError(result);
			});

			test.effect(`when contains ${RawLF}`, function* () {
				const result = yield* $error.decodeFail("-err\ror\r\n");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $error.decodeFail("-err\r\nleft\r\nover");
				expectParseError(result);
			});
		});
	});
});
