import { expectFail, test } from "$/test";
import { describe, expect } from "bun:test";
import { Effect, Schema } from "effect";
import { Boolean_, Null } from "./primitives";
import { expectParseError } from "./test";

const Invalid = "invalid";

describe("null", () => {
	const decode = Schema.decodeUnknown(Null);
	const encode = Schema.encodeUnknown(Null);

	describe("with valid data", () => {
		const EncodedNull = "_\r\n";

		test.effect("is decoded", () => {
			return Effect.gen(function* () {
				const result = yield* decode(EncodedNull);
				expect(result).toBe(null);
			});
		});

		test.effect("is encoded", () => {
			return Effect.gen(function* () {
				const result = yield* encode(null);
				expect(result).toBe(EncodedNull);
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded", () => {
			return Effect.gen(function* () {
				const result = yield* decode(Invalid).pipe(expectFail);
				expectParseError(result);
			});
		});

		test.effect("is not encoded", () => {
			return Effect.gen(function* () {
				const result = yield* encode(Invalid).pipe(expectFail);
				expectParseError(result);
			});
		});
	});
});

describe("boolean", () => {
	const decode = Schema.decodeUnknown(Boolean_);
	const encode = Schema.encodeUnknown(Boolean_);

	describe("with valid data", () => {
		const EncodedTrue = "#t\r\n";
		const EncodedFalse = "#f\r\n";

		describe("is decoded", () => {
			test.effect("to true", () => {
				return Effect.gen(function* () {
					const result = yield* decode(EncodedTrue);
					expect(result).toBe(true);
				});
			});

			test.effect("to false", () => {
				return Effect.gen(function* () {
					const result = yield* decode(EncodedFalse);
					expect(result).toBe(false);
				});
			});
		});

		describe("is encoded", () => {
			test.effect("from true", () => {
				return Effect.gen(function* () {
					const result = yield* encode(true);
					expect(result).toBe(EncodedTrue);
				});
			});

			test.effect("from false", () => {
				return Effect.gen(function* () {
					const result = yield* encode(false);
					expect(result).toBe(EncodedFalse);
				});
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("is not decoded", () => {
			return Effect.gen(function* () {
				const result = yield* decode(Invalid).pipe(expectFail);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("from string", () => {
				return Effect.gen(function* () {
					const result = yield* encode(Invalid).pipe(expectFail);
					expectParseError(result);
				});
			});

			test.effect("from null", () => {
				return Effect.gen(function* () {
					const result = yield* encode(null).pipe(expectFail);
					expectParseError(result);
				});
			});
		});
	});
});
