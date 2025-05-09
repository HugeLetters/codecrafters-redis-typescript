import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Boolean_, LeftoverNull, Null } from "./primitives";

describe("null", () => {
	const $null = createSchemaHelpers(Null);
	const $leftoverNull = createSchemaHelpers(LeftoverNull);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for null", function* () {
				const result = yield* $null.decode("_\r\n");
				expect(result).toBe(null);
			});

			test.effect("for null bulk string", function* () {
				const result = yield* $null.decode("$-1\r\n");
				expect(result).toBe(null);
			});

			test.effect("for null array", function* () {
				const result = yield* $null.decode("*-1\r\n");
				expect(result).toBe(null);
			});

			test.effect("for null with leftover", function* () {
				const result = yield* $leftoverNull.decode("_\r\nleft\r\nover");
				expect(result).toStrictEqual([null, "left\r\nover"]);
			});

			test.effect("for null bulk string with leftover", function* () {
				const result = yield* $leftoverNull.decode("$-1\r\nleft\r\nover");
				expect(result).toStrictEqual([null, "left\r\nover"]);
			});

			test.effect("for null array with leftover", function* () {
				const result = yield* $leftoverNull.decode("*-1\r\nleft\r\nover");
				expect(result).toStrictEqual([null, "left\r\nover"]);
			});
		});

		test.effect("is encoded", function* () {
			const result = yield* $null.encode(null);
			expect(result).toBe("_\r\n");
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("with malformed data", function* () {
				const result = yield* $null.decodeFail("invalid");
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("with string", function* () {
				const result = yield* $null.encodeFail("invalid");
				expectParseError(result);
			});
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
