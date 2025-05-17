import { IntegerFromString } from "$/schema/number";
import type { RespHashableValue, RespData } from "$/schema/resp/main";
import { createPluralizer } from "$/utils/locale";
import { Array as Arr, Hash, HashMap, Iterable, ParseResult } from "effect";

export function serializeRespValue(value: RespValue): string {
	if (Arr.isArray<RespValue>(value)) {
		return `[${value.map(serializeRespValue).join(", ")}]`;
	}

	if (HashMap.isHashMap(value)) {
		const entries = HashMap.entries(value);
		const items = Iterable.map(entries, ([key, value]) => {
			return `${serializeRespValue(key)} ~> ${serializeRespValue(value)}`;
		});
		return `HashMap(${[...items].join(", ")})`;
	}

	return String(value);
}

export function hashableRespValue(
	value: RespValue,
): RespHashableValue | number {
	if (Arr.isArray<RespValue>(value)) {
		return Hash.array(value);
	}

	return value;
}

export const decodeIntFromString = ParseResult.decodeUnknown(IntegerFromString);

export const itemPlural = createPluralizer({ one: "item", many: "items" });
export const entryPlural = createPluralizer({ one: "entry", many: "entries" });
