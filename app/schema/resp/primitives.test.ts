import { describe, expect } from "bun:test";
import { test } from "$/test";
import { Effect } from "effect";
import { createSchemaHelpers, expectParseError } from "../test";
import { Boolean_, Null } from "./primitives";

const Invalid = "invalid";

describe("null", () => {
	const $null = createSchemaHelpers(Null);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("for null", () => {
				return Effect.gen(function* () {
					const result = yield* $null.decode("_\r\n");
					expect(result).toBe(null);
				});
			});

			test.effect("for null nulk string", () => {
				return Effect.gen(function* () {
					const result = yield* $null.decode("$-1\r\n");
					expect(result).toBe(null);
				});
			});

			test.effect("for null array", () => {
				return Effect.gen(function* () {
					const result = yield* $null.decode("*-1\r\n");
					expect(result).toBe(null);
				});
			});
		});

		test.effect("is encoded", () => {
			return Effect.gen(function* () {
				const result = yield* $null.encode(null);
				expect(result).toBe("_\r\n");
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded", () => {
			return Effect.gen(function* () {
				const result = yield* $null.decodeFail(Invalid);
				expectParseError(result);
			});
		});

		test.effect("is not encoded", () => {
			return Effect.gen(function* () {
				const result = yield* $null.encodeFail(Invalid);
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
			test.effect("to true", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.decode(EncodedTrue);
					expect(result).toBe(true);
				});
			});

			test.effect("to false", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.decode(EncodedFalse);
					expect(result).toBe(false);
				});
			});
		});

		describe("is encoded", () => {
			test.effect("from true", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.encode(true);
					expect(result).toBe(EncodedTrue);
				});
			});

			test.effect("from false", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.encode(false);
					expect(result).toBe(EncodedFalse);
				});
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded", () => {
			return Effect.gen(function* () {
				const result = yield* $boolean.decodeFail(Invalid);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("from string", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.encodeFail(Invalid);
					expectParseError(result);
				});
			});

			test.effect("from null", () => {
				return Effect.gen(function* () {
					const result = yield* $boolean.encodeFail(null);
					expectParseError(result);
				});
			});
		});
	});
});
