import { describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { Boolean_, Null } from "./primitives";

const Invalid = "invalid";

describe("null", () => {
	const decode = Schema.decodeUnknown(Null);
	const encode = Schema.encodeUnknown(Null);

	describe("with valid data", () => {
		const EncodedNull = "_\r\n";

		it.effect("is decoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(EncodedNull);
				expect(result).toBe(null);
			});
		});

		it.effect("is encoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(null);
				expect(result).toBe(EncodedNull);
			});
		});
	});

	describe("with invalid data", () => {
		it.effect("is not decoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(Invalid).pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});

		it.effect("is not encoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(Invalid).pipe(Effect.isFailure);
				expect(result).toBe(true);
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

		it.effect("is decoded to true", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(EncodedTrue);
				expect(result).toBe(true);
			});
		});

		it.effect("is decoded to false", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(EncodedFalse);
				expect(result).toBe(false);
			});
		});

		it.effect("is encoded to true", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(true);
				expect(result).toBe(EncodedTrue);
			});
		});

		it.effect("is encoded to false", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(false);
				expect(result).toBe(EncodedFalse);
			});
		});
	});

	describe("with invalid data", () => {
		it.effect("is not decoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(Invalid).pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});

		it.effect("is not encoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(Invalid).pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});
	});
});
