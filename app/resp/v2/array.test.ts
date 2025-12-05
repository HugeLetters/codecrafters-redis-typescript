import { describe, expect } from "bun:test";
import { RespError } from "$/resp/error";
import { arr, bulk, bulknull, err, int, simple } from "$/resp/test.utils";
import { Integer } from "$/schema/number";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { RespArray } from "./array";

const $array = createSchemaHelpers(RespArray);
const i = Integer.make;

describe("Array", () => {
	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("empty", function* () {
				const result = yield* $array.decode(arr([]));
				expect(result).toStrictEqual([]);
			});

			test.effect("single item", function* () {
				const result = yield* $array.decode(arr([int(123)]));
				expect(result).toStrictEqual([i(123)]);
			});

			test.effect("mixed types", function* () {
				const encoded = arr([bulk("foo"), int(42), simple("OK"), err("ERR")]);
				const result = yield* $array.decode(encoded);
				const expected = [
					"foo",
					i(42),
					"OK",
					new RespError({ message: "ERR" }),
				];
				expect(result).toStrictEqual(expected);
			});

			test.effect("nested arrays", function* () {
				const encoded = arr([arr([int(1), int(2)]), arr([bulk("bar")])]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual([[i(1), i(2)], ["bar"]]);
			});

			test.effect("deeply nested arrays", function* () {
				const encoded = arr([arr([arr([bulk("deep")])])]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual([[["deep"]]]);
			});

			test.effect("nested array in the middle", function* () {
				const encoded = arr([
					bulk("hello"),
					arr([bulk("a"), bulk("b")]),
					bulk("world"),
				]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual(["hello", ["a", "b"], "world"]);
			});

			test.effect("nested array at end", function* () {
				const encoded = arr([int(1), int(2), arr([bulk("a"), bulk("b")])]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual([i(1), i(2), ["a", "b"]]);
			});

			test.effect("nulls", function* () {
				const encoded = arr([bulknull, bulk("x"), bulknull]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual([null, "x", null]);
			});

			test.effect("bulk strings containing CR, LF, and CRLF", function* () {
				const cr = "c\rr";
				const lf = "l\nf";
				const crlf = "cr\r\nlf";
				const encoded = arr([bulk(cr), bulk(lf), bulk(crlf)]);
				const result = yield* $array.decode(encoded);
				expect(result).toStrictEqual([cr, lf, crlf]);
			});
		});

		describe("is encoded", () => {
			test.effect("empty array", function* () {
				const result = yield* $array.encode([]);
				expect(result).toBe(arr([]));
			});

			test.effect("single item array", function* () {
				const result = yield* $array.encode([i(123)]);
				expect(result).toBe(arr([int(123)]));
			});

			test.effect("array of bulk strings", function* () {
				const result = yield* $array.encode(["hello world!", "hello earth!"]);
				expect(result).toBe(arr([bulk("hello world!"), bulk("hello earth!")]));
			});

			test.effect("nested arrays", function* () {
				const result = yield* $array.encode([[i(1), i(2)], ["bar"]]);
				const expected = arr([arr([int(1), int(2)]), arr([simple("bar")])]);
				expect(result).toBe(expected);
			});

			test.effect("deeply nested arrays", function* () {
				const result = yield* $array.encode([[["deepnestedarray"]]]);
				expect(result).toBe(arr([arr([arr([bulk("deepnestedarray")])])]));
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("too few items", function* () {
				const result = yield* $array.decodeFail(`*2\r\n${bulk("a")}`);
				yield* expectParseError.withMessage(result, "2");
				yield* expectParseError.withMessage(result, "1");
			});

			test.effect("nested array with too few items", function* () {
				const input = `*2\r\n*1\r\n${bulk("a")}*2\r\n${bulk("c")}`;
				const result = yield* $array.decodeFail(input);
				yield* expectParseError.withMessage(result, "2");
				yield* expectParseError.withMessage(result, "1");
			});

			test.effect("too many items", function* () {
				const data = `*1\r\n${bulk("a")}${bulk("extra")}`;
				const result = yield* $array.decodeFail(data);
				yield* expectParseError.withMessage(result, "Leftover");
				yield* expectParseError.withMessage(result, "extra");
			});

			test.effect("invalid item", function* () {
				const input = `*4\r\n${bulk("a")}${bulk("b")}$invalid\r\n${simple("c")}`;
				const result = yield* $array.decodeFail(input);
				yield* expectParseError.withMessage(result, "$invalid");
			});

			test.effect("invalid nested array", function* () {
				const input = `*4\r\n${bulk("a")}${bulk("b")}*2\r\n${bulk("c")}*1\r\n:invalid\r\n${simple("d")}`;
				const result = yield* $array.decodeFail(input);
				yield* expectParseError.withMessage(result, ":invalid");
			});

			test.effect("missing array prefix", function* () {
				const input = `2\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decodeFail(input);
				yield* expectParseError.withMessage(result, "*");
			});

			test.effect("missing CRLF after count", function* () {
				const input = `*2${bulk("a")}${bulk("b")}`;
				const result = yield* $array.decodeFail(input);
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
				yield* expectParseError.withMessage(
					result,
					"Expected ReadonlyArray<RespValue>",
				);
				yield* expectParseError.withMessage(result, "not-an-array");
			});

			test.effect("array with undefined", function* () {
				const result = yield* $array.encodeFail([undefined]);
				yield* expectParseError.withMessage(result, "Expected RespValue");
				yield* expectParseError.withMessage(result, "undefined");
			});

			test.effect("array with object", function* () {
				const result = yield* $array.encodeFail([{ a: 3 }]);
				yield* expectParseError.withMessage(result, "Expected RespValue");
			});
		});
	});
});
