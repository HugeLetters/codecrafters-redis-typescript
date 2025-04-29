import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Boolean_, Null } from "./primitives";

const Invalid = "invalid";

describe("null", () => {
	const $null = createSchemaHelpers(Null);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for null", function* () {
				const result = yield* $null.decode("_\r\n");
				expect(result).toBe(null);
			});

			test.effect("for null nulk string", function* () {
				const result = yield* $null.decode("$-1\r\n");
				expect(result).toBe(null);
			});

			test.effect("for null array", function* () {
				const result = yield* $null.decode("*-1\r\n");
				expect(result).toBe(null);
			});
		});

		test.effect("is encoded", function* () {
			const result = yield* $null.encode(null);
			expect(result).toBe("_\r\n");
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded", function* () {
			const result = yield* $null.decodeFail(Invalid);
			expectParseError(result);
		});

		test.effect("is not encoded", function* () {
			const result = yield* $null.encodeFail(Invalid);
			expectParseError(result);
		});
	});
});

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
		test.effect("is not decoded", function* () {
			const result = yield* $boolean.decodeFail(Invalid);
			expectParseError(result);
		});

		describe("is not encoded", () => {
			test.effect("from string", function* () {
				const result = yield* $boolean.encodeFail(Invalid);
				expectParseError(result);
			});

			test.effect("from null", function* () {
				const result = yield* $boolean.encodeFail(null);
				expectParseError(result);
			});
		});
	});
});
