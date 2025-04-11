import { describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ParseError } from "effect/ParseResult";
import { Integer } from "./number";

describe("Integer", () => {
	const decode = Schema.decodeUnknown(Integer);
	const encode = Schema.encodeUnknown(Integer);

	describe("with valid data", () => {
		describe("is decoded", () => {
			it.effect("for integer", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":1000\r\n");
					expect(result).toBe(1000);
				});
			});

			it.effect("for negative", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":-1000\r\n");
					expect(result).toBe(-1000);
				});
			});

			it.effect("for positive", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":+1000\r\n");
					expect(result).toBe(1000);
				});
			});

			it.effect("for 0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":0\r\n");
					expect(result).toBe(0);
				});
			});

			it.effect("for -0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":-0\r\n");
					expect(result).toBe(-0);
				});
			});

			it.effect("for +0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":+0\r\n");
					expect(result).toBe(0);
				});
			});
		});

		describe("is encoded", () => {
			it.effect("for integer", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(1000);
					expect(result).toBe(":1000\r\n");
				});
			});

			it.effect("for negative", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(-1000);
					expect(result).toBe(":-1000\r\n");
				});
			});

			it.effect("for positive", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(1000);
					expect(result).toBe(":1000\r\n");
				});
			});

			it.effect("for 0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(0);
					expect(result).toBe(":0\r\n");
				});
			});

			it.effect("for -0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(-0);
					expect(result).toBe(":0\r\n");
				});
			});

			it.effect("for +0", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(+0);
					expect(result).toBe(":0\r\n");
				});
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			it.effect("when doesnt conform to schema", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode("invalid").pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when doesnt end with crlf", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":123").pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when has invalid characters", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":123a\r\n").pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when is decimal", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* decode(":123.45\r\n").pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});
		});

		describe("is not encoded", () => {
			it.effect("when input is string", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode("abc").pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when input is null", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(null).pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when input is undefined", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(undefined).pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});

			it.effect("when input is decimal", ({ expect }) => {
				return Effect.gen(function* () {
					const result = yield* encode(123.45).pipe(Effect.flip);
					expect(result).instanceof(ParseError);
				});
			});
		});
	});
});
