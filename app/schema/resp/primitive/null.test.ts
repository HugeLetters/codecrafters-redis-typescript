import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { LeftoverNull, Null } from "./null";

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
