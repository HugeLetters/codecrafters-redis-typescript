import { describe, expect } from "bun:test";
import { AttributePrefix } from "$/resp/v3/container/prefix";
import { createSchemaHelpers, expectParseError } from "$/schema/test";
import { test } from "$/test";
import { arr, bulk, hashmap, int, respmap, simple } from "../test.utils";
import { RespValue } from "./main";

function respattribute(entries: Array<[string, string]>) {
	return `${AttributePrefix}${entries.length}\r\n${entries.map(([k, v]) => k + v).join("")}`;
}

const Attribute = respattribute([[simple("meta"), arr([bulk("str")])]]);
function withAttribute(data: string) {
	return `${Attribute}${data}`;
}

describe("RespValue", () => {
	const $resp = createSchemaHelpers(RespValue);

	describe("with valid data", () => {
		describe("is decoded", () => {
			test.effect("simple string with attribute", function* () {
				const encoded = withAttribute(simple("string"));
				const result = yield* $resp.decode(encoded);
				expect(result).toBe("string");
			});

			test.effect("complex structure without attributes", function* () {
				const encoded = respmap([
					[bulk("bulk"), arr([int(1), int(2), int(3)])],
				]);
				const result = yield* $resp.decode(encoded);
				expect(result).toStrictEqual(hashmap([["bulk", [1, 2, 3]]]));
			});

			test.effect("complex structure with attributes", function* () {
				const encoded = withAttribute(
					respmap([
						[
							withAttribute(bulk("bulk")),
							arr([int(1), withAttribute(int(2)), int(3)]),
						],
					]),
				);
				const result = yield* $resp.decode(encoded);
				expect(result).toStrictEqual(hashmap([["bulk", [1, 2, 3]]]));
			});
		});

		describe("is encoded", () => {
			test.effect("simple string with attribute", function* () {
				const result = yield* $resp.encode("string");
				expect(result).toBe(simple("string"));
			});

			test.effect("complex structure", function* () {
				const result = yield* $resp.encode(hashmap([["simple", [1, 2, 3]]]));
				expect(result).toStrictEqual(
					respmap([[simple("simple"), arr([int(1), int(2), int(3)])]]),
				);
			});
		});
	});

	describe("with invalid data", () => {
		describe("is not decoded", () => {
			test.effect("invalid attribute", function* () {
				const encoded = withAttribute(
					respmap([
						[
							`${AttributePrefix}1\r\n$invalid${bulk("bulk")}`,
							arr([int(1), withAttribute(int(2)), int(3)]),
						],
					]),
				);
				const result = yield* $resp.decodeFail(encoded);
				yield* expectParseError.withMessage(result, "invalid");
			});
		});
	});
});
