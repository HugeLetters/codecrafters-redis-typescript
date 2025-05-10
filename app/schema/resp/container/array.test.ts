import { Error_ } from "$/schema/resp/error";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { Array_ } from "./array";

const bulk = (s: string) => `$${s.length}\r\n${s}\r\n`;
const int = (n: number) => `:${n}\r\n`;
const simple = (s: string) => `+${s}\r\n`;
const err = (s: string) => `-${s}\r\n`;
const null_ = "_\r\n";

describe("Array", () => {
	const $array = createSchemaHelpers(Array_);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("empty", function* () {
				const result = yield* $array.decode("*0\r\n");
				expect(result).toStrictEqual([]);
			});

			test.effect("single item", function* () {
				const result = yield* $array.decode(`*1\r\n${int(123)}`);
				expect(result).toStrictEqual([123]);
			});

			test.effect("integers", function* () {
				const encoded = `3\r\n${int(1)}${int(2)}${int(3)}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([1, 2, 3]);
			});

			test.effect("bulk strings", function* () {
				const encoded = `2\r\n${bulk("hello")}${bulk("world!")}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual(["hello", "world!"]);
			});

			test.effect("mixed types", function* () {
				const encoded = `4\r\n${bulk("foo")}${int(42)}${simple("OK")}${err("ERR")}`;
				const result = yield* $array.decode(`*${encoded}`);
				const expected = ["foo", 42, "OK", new Error_({ message: "ERR" })];
				expect(result).toStrictEqual(expected);
			});

			test.effect("nested arrays", function* () {
				const encoded = `2\r\n*2\r\n${int(1)}${int(2)}*1\r\n${bulk("bar")}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([[1, 2], ["bar"]]);
			});

			test.effect("deeply nested arrays", function* () {
				const encoded = `1\r\n*1\r\n*1\r\n${bulk("deep")}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([[["deep"]]]);
			});

			test.effect("nested array in the middle", function* () {
				const encoded = `3\r\n${bulk("hello")}*2\r\n${bulk("a")}${bulk("b")}${bulk("world")}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual(["hello", ["a", "b"], "world"]);
			});

			test.effect("nested array at end", function* () {
				const encoded = `3\r\n${int(1)}${int(2)}*2\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([1, 2, ["a", "b"]]);
			});

			test.effect("nulls", function* () {
				const encoded = `3\r\n${null_}${bulk("x")}${null_}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([null, "x", null]);
			});

			test.effect("bulk strings containing CR, LF, and CRLF", function* () {
				const cr = "c\rr";
				const lf = "l\nf";
				const crlf = "cr\r\nlf";
				const encoded = `3\r\n${bulk(cr)}${bulk(lf)}${bulk(crlf)}`;
				const result = yield* $array.decode(`*${encoded}`);
				expect(result).toStrictEqual([cr, lf, crlf]);
			});
		});

		describe("is encoded", () => {
			test.effect("empty array", function* () {
				const result = yield* $array.encode([]);
				expect(result).toBe("*0\r\n");
			});

			test.effect("single item array", function* () {
				const result = yield* $array.encode([123]);
				expect(result).toBe(`*1\r\n${int(123)}`);
			});

			test.effect("array of bulk strings", function* () {
				const result = yield* $array.encode(["hello world!", "hello earth!"]);
				expect(result).toBe(
					`*2\r\n${bulk("hello world!")}${bulk("hello earth!")}`,
				);
			});

			test.effect("array of integers", function* () {
				const result = yield* $array.encode([1, 2, 3]);
				expect(result).toBe(`*3\r\n${int(1)}${int(2)}${int(3)}`);
			});

			test.effect("nested arrays", function* () {
				const result = yield* $array.encode([[1, 2], ["bar"]]);
				const expected = `2\r\n*2\r\n${int(1)}${int(2)}*1\r\n${simple("bar")}`;
				expect(result).toBe(`*${expected}`);
			});

			test.effect("deeply nested arrays", function* () {
				const result = yield* $array.encode([[["deepnestedarray"]]]);
				expect(result).toBe(`*1\r\n*1\r\n*1\r\n${bulk("deepnestedarray")}`);
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("too few items", function* () {
				const result = yield* $array.decodeFail(`*2\r\n${bulk("a")}`);
				expectParseError(result);
			});

			test.effect("nested array with too few items", function* () {
				const input = `*2\r\n*1\r\n${bulk("a")}*2\r\n${bulk("c")}`;
				const result = yield* $array.decodeFail(input);
				expectParseError(result);
			});

			test.effect("too many items", function* () {
				const data = `*1\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decodeFail(data);
				expectParseError(result);
			});

			test.effect("invalid item", function* () {
				const input = `*4\r\n${bulk("a")}${bulk("b")}$invalid\r\n${simple("c")}`;
				const result = yield* $array.decodeFail(input);
				expectParseError(result);
			});

			test.effect("invalid nested array", function* () {
				const input = `*4\r\n${bulk("a")}${bulk("b")}*2\r\n${bulk("c")}*1\r\n:invalid\r\n${simple("d")}`;
				const result = yield* $array.decodeFail(input);
				expectParseError(result);
			});

			test.effect("missing array prefix", function* () {
				const input = `2\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decodeFail(input);
				expectParseError(result);
			});

			test.effect("missing CRLF after count", function* () {
				const result = yield* $array.decodeFail(`*2${bulk("a")}${bulk("b")}`);
				expectParseError(result);
			});

			test.effect("non-numeric count", function* () {
				const input = `*a\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decodeFail(input);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("string", function* () {
				const result = yield* $array.encodeFail("not-an-array");
				expectParseError(result);
			});

			test.effect("array with undefined", function* () {
				const result = yield* $array.encodeFail([undefined]);
				expectParseError(result);
			});

			test.effect("array with object", function* () {
				const result = yield* $array.encodeFail([{ a: 3 }]);
				expectParseError(result);
			});
		});
	});
});
