import { Error_ } from "$/schema/resp/error";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { expectEquivalence, test } from "$/test";
import { describe, expect } from "bun:test";
import { Set_ } from "./set";
import { respset, bulk, err, int, null_, simple, hashset } from "./test-utils";

describe("Set", () => {
	const $set = createSchemaHelpers(Set_);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("empty", function* () {
				const result = yield* $set.decode(respset([]));
				expect(result).toStrictEqual(hashset([]));
			});

			test.effect("single item", function* () {
				const result = yield* $set.decode(respset([int(123)]));
				expect(result).toStrictEqual(hashset([123]));
			});

			test.effect("integers", function* () {
				const encoded = respset([int(1), int(2), int(3)]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(hashset([1, 2, 3]));
			});

			test.effect("bulk strings", function* () {
				const input = respset([bulk("hello"), bulk("world!")]);
				const result = yield* $set.decode(input);
				expect(result).toStrictEqual(hashset(["hello", "world!"]));
			});

			test.effect("mixed types", function* () {
				const encoded = respset([
					bulk("foo"),
					int(42),
					simple("OK"),
					err("ERR"),
				]);
				const result = yield* $set.decode(encoded);
				const expected = ["foo", 42, "OK", new Error_({ message: "ERR" })];
				expectEquivalence(result, hashset(expected));
			});

			test.effect("nested respsetays", function* () {
				const encoded = respset([
					respset([int(1), int(2)]),
					respset([bulk("bar")]),
				]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(
					hashset([hashset([1, 2]), hashset(["bar"])]),
				);
			});

			test.effect("deeply nested respsetays", function* () {
				const encoded = respset([respset([respset([bulk("deep")])])]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(hashset([hashset([hashset(["deep"])])]));
			});

			test.effect("nested respsetay in the middle", function* () {
				const encoded = respset([
					bulk("hello"),
					respset([bulk("a"), bulk("b")]),
					bulk("world"),
				]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(
					hashset(["hello", hashset(["a", "b"]), "world"]),
				);
			});

			test.effect("nested respsetay at end", function* () {
				const encoded = respset([
					int(1),
					int(2),
					respset([bulk("a"), bulk("b")]),
				]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(hashset([1, 2, hashset(["a", "b"])]));
			});

			test.effect("bulk strings containing CR, LF, and CRLF", function* () {
				const cr = "c\rr";
				const lf = "l\nf";
				const crlf = "cr\r\nlf";
				const encoded = respset([bulk(cr), bulk(lf), bulk(crlf)]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(hashset([cr, lf, crlf]));
			});

			test.effect("duplicates are ignored", function* () {
				const encoded = respset([null_, bulk("x"), null_]);
				const result = yield* $set.decode(encoded);
				expect(result).toStrictEqual(hashset(["x", null]));
			});
		});

		describe("is encoded", () => {
			test.effect("empty respsetay", function* () {
				const result = yield* $set.encode(hashset([]));
				expect(result).toBe(respset([]));
			});

			test.effect("single item respsetay", function* () {
				const result = yield* $set.encode(hashset([123]));
				expect(result).toBe(respset([int(123)]));
			});

			test.effect("respsetay of bulk strings", function* () {
				const result = yield* $set.encode(
					hashset(["hello world!", "hello earth!"]),
				);
				expect(result).toBe(
					respset([bulk("hello world!"), bulk("hello earth!")]),
				);
			});

			test.effect("respsetay of integers", function* () {
				const result = yield* $set.encode(hashset([1, 2, 3]));
				expect(result).toBe(respset([int(1), int(2), int(3)]));
			});

			test.effect("nested respsetays", function* () {
				const result = yield* $set.encode(
					hashset([hashset([1, 2]), hashset(["bar"])]),
				);
				const expected = respset([
					respset([int(1), int(2)]),
					respset([simple("bar")]),
				]);
				expect(result).toBe(expected);
			});

			test.effect("deeply nested respsetays", function* () {
				const result = yield* $set.encode(
					hashset([hashset([hashset(["deepnestedrespsetay"])])]),
				);
				expect(result).toBe(
					respset([respset([respset([bulk("deepnestedrespsetay")])])]),
				);
			});

			test.effect("duplicates are ignored", function* () {
				const input = hashset([null, "x", null]);
				const result = yield* $set.encode(input);
				expect(result).toStrictEqual(respset([simple("x"), null_]));
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("too few items", function* () {
				const result = yield* $set.decodeFail(`~2\r\n${bulk("a")}`);
				expectParseError(result);
			});

			test.effect("nested respsetay with too few items", function* () {
				const input = `~2\r\n~1\r\n${bulk("a")}~2\r\n${bulk("c")}`;
				const result = yield* $set.decodeFail(input);
				expectParseError(result);
			});

			test.effect("too many items", function* () {
				const data = `~1\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $set.decodeFail(data);
				expectParseError(result);
			});

			test.effect("invalid item", function* () {
				const input = `~4\r\n${bulk("a")}${bulk("b")}$invalid\r\n${simple("c")}`;
				const result = yield* $set.decodeFail(input);
				expectParseError(result);
			});

			test.effect("invalid nested respsetay", function* () {
				const input = `~4\r\n${bulk("a")}${bulk("b")}*2\r\n${bulk("c")}~1\r\n:invalid\r\n${simple("d")}`;
				const result = yield* $set.decodeFail(input);
				expectParseError(result);
			});

			test.effect("missing respsetay prefix", function* () {
				const input = `2\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $set.decodeFail(input);
				expectParseError(result);
			});

			test.effect("missing CRLF after count", function* () {
				const result = yield* $set.decodeFail(`~2${bulk("a")}${bulk("b")}`);
				expectParseError(result);
			});

			test.effect("non-numeric count", function* () {
				const input = `~a\r\n${bulk("a")}${bulk("b")}`;
				const result = yield* $set.decodeFail(input);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("string", function* () {
				const result = yield* $set.encodeFail("not-an-respsetay");
				expectParseError(result);
			});

			test.effect("respsetay with undefined", function* () {
				const result = yield* $set.encodeFail(hashset([undefined]));
				expectParseError(result);
			});

			test.effect("respsetay with object", function* () {
				const result = yield* $set.encodeFail(hashset([{ a: 3 }]));
				expectParseError(result);
			});
		});
	});
});
