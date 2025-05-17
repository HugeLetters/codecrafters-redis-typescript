import { IntegerFromString } from "$/schema/number";
import type { RespHashableValue, RespValue } from "$/schema/resp/main";
import { createPluralizer } from "$/utils/locale";
import {
	Array as Arr,
	Hash,
	HashMap,
	HashSet,
	Iterable,
	ParseResult,
} from "effect";

export function serializeRespValue(value: RespValue): string {
	if (Arr.isArray<RespValue>(value)) {
		return `[${value.map(serializeRespValue).join(", ")}]`;
	}

	if (HashMap.isHashMap(value)) {
		const items = Iterable.map(value, ([key, value]) => {
			return `${serializeRespValue(key)} ~> ${serializeRespValue(value)}`;
		});
		return `HashMap[${[...items].join(", ")}]`;
	}

	if (HashSet.isHashSet(value)) {
		const items = Iterable.map(value, serializeRespValue);
		return `HashSet[${[...items].join(", ")}]`;
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
