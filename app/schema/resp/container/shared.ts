import type { BigNumber, Double, Integer } from "$/schema/resp/number";
import type { Boolean_, Null } from "$/schema/resp/primitives";
import type {
	BulkString,
	ErrorFromBulkString,
	ErrorFromSimpleString,
	SimpleString,
	VerbatimString,
} from "$/schema/resp/string";

type RespBasicSchema =
	| typeof SimpleString
	| typeof BulkString
	| typeof VerbatimString
	| typeof Integer
	| typeof Double
	| typeof BigNumber
	| typeof Null
	| typeof Boolean_
	| typeof ErrorFromSimpleString
	| typeof ErrorFromBulkString;

export type RespData = RespBasicSchema["Type"] | ReadonlyArray<RespData>;

export type WithRestData<T> = {
	readonly data: T;
	readonly rest: string;
};
