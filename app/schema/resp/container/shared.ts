import { BigNumber, Double, Integer } from "$/schema/resp/number";
import { Boolean_, PlainNull } from "$/schema/resp/primitives";
import {
	ErrorFromString,
	String_,
	VerbatimStringFromString,
} from "$/schema/resp/string";
import { Schema } from "effect";
import { Array_ } from "./array";

const RespBasicSchema = Schema.Union(
	String_,
	VerbatimStringFromString,
	Integer,
	Double,
	BigNumber,
	PlainNull,
	Boolean_,
	ErrorFromString,
);

/** For encoding only */
export const RespSchema = Schema.Union(
	...RespBasicSchema.members,
	Schema.suspend(() => Array_),
).pipe(Schema.annotations({ identifier: "RespValue" }));

export type RespData = typeof RespBasicSchema.Type | ReadonlyArray<RespData>;
