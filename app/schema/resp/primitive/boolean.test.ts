import { describe, expect } from "bun:test";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { Boolean_ } from "./boolean";

describe("boolean", () => {
	const $boolean = createSchemaHelpers(Boolean_);

	describe("with valid data", () => {
		const EncodedTrue = "#t\r\n";
		const EncodedFalse = "#f\r\n";

		describe("is decoded", () => {
			test.effect("to true", function* () {
				const result = yield* $boolean.decode(EncodedTrue);
				expect(result).toBe(true);
			});

			test.effect("to false", function* () {
				const result = yield* $boolean.decode(EncodedFalse);
				expect(result).toBe(false);
			});
		});

		describe("is encoded", () => {
			test.effect("from true", function* () {
				const result = yield* $boolean.encode(true);
				expect(result).toBe(EncodedTrue);
			});

			test.effect("from false", function* () {
				const result = yield* $boolean.encode(false);
				expect(result).toBe(EncodedFalse);
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("with malformed data", function* () {
				const result = yield* $boolean.decodeFail("invalid");
				expectParseError(result);
			});

			test.effect("with leftover", function* () {
				const result = yield* $boolean.decodeFail("#t\r\nleft\r\nover");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("from string", function* () {
				const result = yield* $boolean.encodeFail("invalid");
				expectParseError(result);
			});

			test.effect("from null", function* () {
				const result = yield* $boolean.encodeFail(null);
				expectParseError(result);
			});
		});
	});
});
