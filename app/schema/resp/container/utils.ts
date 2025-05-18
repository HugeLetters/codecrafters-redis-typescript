import { IntegerFromString } from "$/schema/number";
import type { RespHashableValue, RespValue } from "$/schema/resp/main";
import { createPluralizer } from "$/utils/locale";
import { Array as Arr, Hash, ParseResult } from "effect";

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
