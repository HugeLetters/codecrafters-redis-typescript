import { IntegerFromString } from "$/schema/number";
import { createPluralizer } from "$/utils/locale";
import { ParseResult } from "effect";

export const decodeIntFromString = ParseResult.decodeUnknown(IntegerFromString);

export const itemPlural = createPluralizer({ one: "item", many: "items" });
export const entryPlural = createPluralizer({ one: "entry", many: "entries" });
