import type * as Effect from "effect/Effect";
import type * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";

import { Color } from "$/schema/utils";

export function LeftoverData<TType, TEncoded, TReq>(
	schema: Schema.Schema<TType, TEncoded, TReq>,
) {
	return Schema.Struct({ data: schema, leftover: Schema.String }).pipe(
		Schema.annotations({ identifier: `LeftoverData<${schema}>` }),
	);
}

type LeftoverSchema<TType, TEncoded = unknown, TReq = never> = ReturnType<
	typeof LeftoverData<TType, TEncoded, TReq>
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
