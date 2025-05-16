import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { describe, expect } from "bun:test";
import { HashMap } from "effect";
import { Error_ } from "../error";
import { Map_ } from "./map";
import {
	arr,
	bulk,
	err,
	hashmap,
	int,
	null_,
	respmap,
	simple,
} from "./test-utils";
import type { RespHashableValue, RespValue } from "./utils";

describe("Map", () => {
	const $map = createSchemaHelpers(Map_);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("empty map", function* () {
				const result = yield* $map.decode("%0\r\n");
				expect(result).toStrictEqual(HashMap.fromIterable([]));
			});

			test.effect("single entry", function* () {
				const encoded = respmap([[simple("foo"), int(1)]]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(hashmap([["foo", 1]]));
			});

			test.effect("multiple entries", function* () {
				const encoded = respmap([
					[simple("first"), int(1)],
					[simple("second"), int(2)],
				]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([
						["first", 1],
						["second", 2],
					]),
				);
			});

			test.effect("mixed types as values", function* () {
				const encoded = respmap([
					[simple("foo"), int(42)],
					[simple("bar"), int(7)],
					[simple("err"), null_],
				]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([
						["foo", 42],
						["bar", 7],
						["err", null],
					]),
				);
			});

			test.effect("nested maps as values", function* () {
				const nested = respmap([
					[simple("a"), int(1)],
					[simple("b"), int(2)],
				]);
				const encoded = respmap([[simple("outer"), nested]]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([
						[
							"outer",
							hashmap([
								["a", 1],
								["b", 2],
							]),
						],
					]),
				);
			});

			test.effect("nested maps as keys", function* () {
				const nested = respmap([[simple("k"), int(99)]]);
				const encoded = respmap([[nested, int(1)]]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(hashmap([[hashmap([["k", 99]]), 1]]));
			});

			test.effect("null values", function* () {
				const encoded = respmap([
					[simple("foo"), null_],
					[simple("bar"), int(1)],
				]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([
						["foo", null],
						["bar", 1],
					]),
				);
			});

			test.effect("bulk strings containing CR, LF, and CRLF", function* () {
				const cr = "c\rr";
				const lf = "l\nf";
				const crlf = "cr\r\nlf";
				const encoded = respmap([
					[bulk("crkey"), bulk(cr)],
					[bulk("lfkey"), bulk(lf)],
					[bulk("crlfkey"), bulk(crlf)],
				]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([
						["crkey", cr],
						["lfkey", lf],
						["crlfkey", crlf],
					]),
				);
			});

			test.effect("map with nested array of maps", function* () {
				const innerMap = respmap([[simple("a"), int(1)]]);
				const encoded = respmap([[simple("foo"), arr([innerMap, innerMap])]]);
				const result = yield* $map.decode(encoded);
				expect(result).toStrictEqual(
					hashmap([["foo", [hashmap([["a", 1]]), hashmap([["a", 1]])]]]),
				);
			});
		});

		describe("is encoded", () => {
			test.effect("empty map", function* () {
				const result = yield* $map.encode(HashMap.empty());
				expect(result).toBe("%0\r\n");
			});

			test.effect("single entry", function* () {
				const result = yield* $map.encode(hashmap([["foo", 1]]));
				expect(result).toBe(respmap([[simple("foo"), int(1)]]));
			});

			test.effect("multiple entries", function* () {
				const result = yield* $map.encode(
					hashmap<RespHashableValue, RespValue>([
						[new Error_({ message: "err" }), 1],
						["second", 2],
					]),
				);
				expect(result).toBe(
					respmap([
						[err("err"), int(1)],
						[simple("second"), int(2)],
					]),
				);
			});

			test.effect("map with nested map value", function* () {
				const input = hashmap([
					[
						"outer",
						hashmap([
							["a", 1],
							["b", 2],
						]),
					],
				]);
				const result = yield* $map.encode(input);
				const expected = respmap([
					[
						simple("outer"),
						respmap([
							[simple("a"), int(1)],
							[simple("b"), int(2)],
						]),
					],
				]);
				expect(result).toBe(expected);
			});

			test.effect("map with null value", function* () {
				const result = yield* $map.encode(hashmap([["foo", null]]));
				expect(result).toBe(respmap([[simple("foo"), null_]]));
			});

			test.effect("map with nested array of maps", function* () {
				const input = hashmap([
					["foo", [hashmap([["a", 1]]), hashmap([["a", 1]])]],
				]);
				const result = yield* $map.encode(input);
				expect(result).toBe(
					respmap([
						[
							simple("foo"),
							arr([
								respmap([[simple("a"), int(1)]]),
								respmap([[simple("a"), int(1)]]),
							]),
						],
					]),
				);
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("too few items", function* () {
				const encoded = `%2\r\n${simple("foo")}${int(1)}`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});

			test.effect("too many items", function* () {
				const encoded = `%1\r\n${simple("foo")}${int(1)}${simple("bar")}${int(2)}`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});

			test.effect("invalid value type", function* () {
				const encoded = `%1\r\n${simple("foo")}$invalid\r\n`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});

			test.effect("missing map prefix", function* () {
				const encoded = `1\r\n${simple("foo")}${int(1)}`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});

			test.effect("missing CRLF after count", function* () {
				const encoded = `%1${simple("foo")}${int(1)}`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});

			test.effect("non-numeric count", function* () {
				const encoded = `%a\r\n${simple("foo")}${int(1)}`;
				const result = yield* $map.decodeFail(encoded);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("string", function* () {
				const result = yield* $map.encodeFail("not-a-map");
				expectParseError(result);
			});

			test.effect("map with undefined value", function* () {
				const result = yield* $map.encodeFail(hashmap([["foo", undefined]]));
				expectParseError(result);
			});

			test.effect("map with object value", function* () {
				const result = yield* $map.encodeFail(hashmap([["foo", { a: 3 }]]));
				expectParseError(result);
			});
		});
	});
});
