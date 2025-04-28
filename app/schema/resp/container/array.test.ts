import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Effect } from "effect";
import { createSchemaHelpers, expectParseError } from "../../test";
import { Array_ } from "./array";
import { Error_ } from "../string";

const bulk = (s: string) => `$${s.length}\r\n${s}\r\n`;
const int = (n: number) => `:${n}\r\n`;
const simple = (s: string) => `+${s}\r\n`;
const err = (s: string) => `-${s}\r\n`;
const null_ = "_\r\n";

describe("Array", () => {
	const $array = createSchemaHelpers(Array_);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("empty array", () => {
				return Effect.gen(function* () {
					const result = yield* $array.decode("*0\r\n");
					expect(result).toStrictEqual([]);
				});
			});

			test.effect("single element array", () => {
				return Effect.gen(function* () {
					const result = yield* $array.decode(`*1\r\n${int(123)}`);
					expect(result).toStrictEqual([123]);
				});
			});

			test.effect("array of bulk strings", () => {
				return Effect.gen(function* () {
					const encoded = `2\r\n${bulk("hello")}${bulk("world")}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual(["hello", "world"]);
				});
			});

			test.effect("array of integers", () => {
				return Effect.gen(function* () {
					const encoded = `3\r\n${int(1)}${int(2)}${int(3)}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual([1, 2, 3]);
				});
			});

			test.effect("mixed types", () => {
				return Effect.gen(function* () {
					const encoded = `4\r\n${bulk("foo")}${int(42)}${simple("OK")}${err("ERR")}`;
					const result = yield* $array.decode(`*${encoded}`);
					const expected = ["foo", 42, "OK", new Error_({ message: "ERR" })];
					expect(result).toStrictEqual(expected);
				});
			});

			test.effect("nested arrays", () => {
				return Effect.gen(function* () {
					const encoded = `2\r\n*2\r\n${int(1)}${int(2)}*1\r\n${bulk("bar")}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual([[1, 2], ["bar"]]);
				});
			});

			test.effect("deeply nested arrays", () => {
				return Effect.gen(function* () {
					const encoded = `1\r\n*1\r\n*1\r\n${bulk("deep")}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual([[["deep"]]]);
				});
			});

			test.effect("nested array at end", () => {
				return Effect.gen(function* () {
					const encoded = `3\r\n${int(1)}${int(2)}*2\r\n${bulk("a")}${bulk("b")}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual([1, 2, ["a", "b"]]);
				});
			});

			test.effect("array with nulls", () => {
				return Effect.gen(function* () {
					const encoded = `3\r\n${null_}${bulk("x")}${null_}`;
					const result = yield* $array.decode(`*${encoded}`);
					expect(result).toStrictEqual([null, "x", null]);
				});
			});
		});

		describe("is encoded", () => {
			test.effect("empty array", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode([]);
					expect(result).toBe("*0\r\n");
				});
			});

			test.effect("single element array", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode([123]);
					expect(result).toBe(`*1\r\n${int(123)}`);
				});
			});

			test.effect("array of bulk strings", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode(["hello", "world"]);
					expect(result).toBe(`*2\r\n${bulk("hello")}${bulk("world")}`);
				});
			});

			test.effect("array of integers", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode([1, 2, 3]);
					expect(result).toBe(`*3\r\n${int(1)}${int(2)}${int(3)}`);
				});
			});

			test.effect("nested arrays", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode([[1, 2], ["bar"]]);
					const expected = `2\r\n*2\r\n${int(1)}${int(2)}*1\r\n${bulk("bar")}`;
					expect(result).toBe(`*${expected}`);
				});
			});

			test.effect("deeply nested arrays", () => {
				return Effect.gen(function* () {
					const result = yield* $array.encode([[["deep"]]]);
					expect(result).toBe(`*1\r\n*1\r\n*1\r\n${bulk("deep")}`);
				});
			});
		});
	});

	describe("with invalid data", () => {
		test.effect("wrong element count (too few)", () => {
			return Effect.gen(function* () {
				const result = yield* $array.decodeFail(`*2\r\n${bulk("a")}`);
				expectParseError(result);
			});
		});

		test.effect("wrong element count (too many)", () => {
			return Effect.gen(function* () {
				const result = yield* $array.decodeFail(
					`*1\r\n${bulk("a")}${bulk("b")}`,
				);
				expectParseError(result);
			});
		});

		test.effect("malformed inner element", () => {
			return Effect.gen(function* () {
				const result = yield* $array.decodeFail(`*2\r\n${bulk("a")}notvalid`);
				expectParseError(result);
			});
		});

		test.effect("missing array prefix", () => {
			return Effect.gen(function* () {
				const result = yield* $array.decodeFail(
					`2\r\n${bulk("a")}${bulk("b")}`,
				);
				expectParseError(result);
			});
		});

		test.effect("missing CRLF after count", () => {
			return Effect.gen(function* () {
				const result = yield* $array.decodeFail(`*2${bulk("a")}${bulk("b")}`);
				expectParseError(result);
			});
		});

		test.effect("encode: non-array input", () => {
			return Effect.gen(function* () {
				const result = yield* $array.encodeFail("not-an-array");
				expectParseError(result);
			});
		});

		test.effect("encode: array with invalid element", () => {
			return Effect.gen(function* () {
				const result = yield* $array.encodeFail([undefined]);
				expectParseError(result);
			});
		});
	});
});
