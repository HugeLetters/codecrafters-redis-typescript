import { describe, expect } from "bun:test";
import { Integer } from "$/schema/number";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { arr, bulk, int, simple } from "../test.utils";
import { RespValue } from "./main";

const $resp = createSchemaHelpers(RespValue);
const i = Integer.make;

describe("RespValue", () => {
	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("complex structure", function* () {
				const encoded = arr([
					arr([bulk("bulk"), arr([int(1), int(2), int(3)])]),
				]);
				const result = yield* $resp.decode(encoded);
				expect(result).toStrictEqual([["bulk", [i(1), i(2), i(3)]]]);
			});
		});

		describe("is encoded", () => {
			test.effect("complex structure", function* () {
				const result = yield* $resp.encode([["simple", [i(1), i(2), i(3)]]]);
				expect(result).toStrictEqual(
					arr([arr([simple("simple"), arr([int(1), int(2), int(3)])])]),
				);
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("invalid value", function* () {
				const encoded = arr([arr([arr([int(1), "invalid", int(2), int(3)])])]);
				const result = yield* $resp.decodeFail(encoded);
				expectParseError(result);
			});
		});

		describe("is not encoded", () => {
			test.effect("invalid value", function* () {
				const encoded = [[[1, undefined, 2, 3]]];
				const result = yield* $resp.encodeFail(encoded);
				expectParseError(result);
			});
		});
	});
});
