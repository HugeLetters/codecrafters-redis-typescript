import type * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { IntegerFromString } from "$/schema/number";
import { Color } from "$/schema/utils";
import { createPluralizer } from "$/utils/locale";

export const parseIntFromString = ParseResult.decode(IntegerFromString);

export function LeftoverData<TSchema extends Schema.Schema.All>(
	schema: TSchema,
) {
	return Schema.Struct({ data: schema, leftover: Schema.String }).pipe(
		Schema.annotations({ identifier: `LeftoverData<${schema}>` }),
	);
}

type LeftoverSchema<TType, TEncoded = unknown, TReq = never> = ReturnType<
	typeof LeftoverData<Schema.Schema<TType, TEncoded, TReq>>
>;
export type LeftoverData<T> = LeftoverSchema<T>["Type"];
export type LeftoverParseResult<T> = Effect.Effect<
	LeftoverData<T>,
	ParseResult.ParseIssue
>;

export function noLeftover<TType, TEncoded, TReq>(
	getLeftover: (value: TType) => string,
	identifier: string,
) {
	return Schema.filter<Schema.Schema<TType, TEncoded, TReq>>(
		(data) => {
			const leftover = getLeftover(data);
			if (leftover === "") {
				return true;
			}

			const received = Color.bad(leftover);
			return `Leftover data must be empty. Received ${received}`;
		},
		{ identifier },
	);
}

export const itemPlural = createPluralizer({ one: "item", many: "items" });
export const entryPlural = createPluralizer({ one: "entry", many: "entries" });

export namespace RegexUtils {
	/** Using `.` doesn't handle newline - or just use `s` flag */
	export const Any = "[\\s\\S]";
	export const Digit = "\\d";
}
