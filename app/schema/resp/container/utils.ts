import * as ParseResult from "effect/ParseResult";
import { IntegerFromString } from "$/schema/number";
import { createPluralizer } from "$/utils/locale";

export const decodeIntFromString = ParseResult.decodeUnknown(IntegerFromString);

export const itemPlural = createPluralizer({ one: "item", many: "items" });
export const entryPlural = createPluralizer({ one: "entry", many: "entries" });
