import { Number_ } from "$/schema/resp/number";
import { Primitive } from "$/schema/resp/primitive";
import { String_ } from "$/schema/resp/string";
import { Schema } from "effect";
import { Array_ } from "./array";

const RespBasicSchema = Schema.Union(
	String_.String,
	String_.VerbatimString,

	Number_.Integer,
	Number_.Double,
	Number_.BigNumber,

	Primitive.PlainNull,
	Primitive.Boolean,

	String_.ErrorFromString,
);

/** For encoding only */
export const RespSchema = Schema.Union(
	...RespBasicSchema.members,
	Schema.suspend(() => Array_),
).pipe(Schema.annotations({ identifier: "RespValue" }));

export type RespData = typeof RespBasicSchema.Type | ReadonlyArray<RespData>;
