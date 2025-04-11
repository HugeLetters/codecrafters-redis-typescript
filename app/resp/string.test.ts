import { describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { SimpleString } from "./string";

describe("SimpleString", () => {
	const decode = Schema.decodeUnknown(SimpleString);
	const encode = Schema.encodeUnknown(SimpleString);

	describe("with valid data", () => {
		const EncodedString = "+string\r\n";
		const DecodedString = "string";

		it.effect("is decoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode(EncodedString);
				expect(result).toBe(DecodedString);
			});
		});

		it.effect("is encoded", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* encode(DecodedString);
				expect(result).toBe(EncodedString);
			});
		});
	});

	describe("with invalid data", () => {
		it.effect("is not decoded when doesnt conform to schema", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode("invalid").pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});

		it.effect("is not decoded when contains \\r", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode("+O\nK\r\n").pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});

		it.effect("is not decoded when contains \\n", ({ expect }) => {
			return Effect.gen(function* () {
				const result = yield* decode("+O\rK\r\n").pipe(Effect.isFailure);
				expect(result).toBe(true);
			});
		});
	});
});
