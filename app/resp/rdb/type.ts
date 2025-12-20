import * as Data from "effect/Data";
import type * as HashMap from "effect/HashMap";
import type * as HashSet from "effect/HashSet";
import type * as SortedSet from "effect/SortedSet";
import type { Satisfies } from "$/utils/type";
import type { ValueType } from "./constants";

export type StringEncoded = string | bigint;

export class RDBList extends Data.TaggedClass("List")<{
	readonly content: ReadonlyArray<StringEncoded>;
}> {}

export class RDBSet extends Data.TaggedClass("Set")<{
	readonly content: HashSet.HashSet<StringEncoded>;
}> {}

export class RDBSortedSetValue extends Data.Class<{
	readonly value: StringEncoded;
	readonly order: number;
}> {}
export class RDBSortedSet extends Data.TaggedClass("SortedSet")<{
	readonly content: SortedSet.SortedSet<RDBSortedSetValue>;
}> {}

export class RDBHash extends Data.TaggedClass("Hash")<{
	readonly content: HashMap.HashMap<string, StringEncoded>;
}> {}

export class IntSet extends Data.TaggedClass("IntSet")<{
	readonly content: SortedSet.SortedSet<bigint>;
}> {}

export type Value =
	| StringEncoded
	| RDBList
	| RDBSet
	| RDBSortedSet
	| RDBHash
	| IntSet;

export class ValueWithMeta extends Data.Class<{
	readonly value: Value;
	readonly expiry: bigint | null;
}> {}

export class DatabaseMeta extends Data.Class<{
	readonly hashSize: bigint;
	readonly expireHashSize: bigint;
}> {}

export type DatabaseEntries = HashMap.HashMap<string, ValueWithMeta>;
export class Database extends Data.Class<{
	readonly meta: DatabaseMeta | null;
	readonly entries: DatabaseEntries;
}> {}
export type Databases = HashMap.HashMap<bigint, Database>;

export type AuxiliaryFields = HashMap.HashMap<string, StringEncoded>;

export class RDBFile extends Data.Class<{
	readonly version: bigint;
	readonly meta: AuxiliaryFields;
	readonly databases: Databases;
}> {}

type RDBValueTypeToValueMapper = Satisfies<
	{
		[ValueType.StringEncoded]: StringEncoded;
		[ValueType.List]: RDBList;
		[ValueType.Set]: RDBSet;
		[ValueType.SortedSet]: RDBSortedSet;
		[ValueType.Hash]: RDBHash;
		[ValueType.Zipmap]: RDBHash;
		[ValueType.Ziplist]: RDBList;
		[ValueType.Intset]: IntSet;
		[ValueType.ZipSortedSet]: RDBSortedSet;
		[ValueType.ZipHashmap]: RDBHash;
		[ValueType.QuickList]: RDBList;
	},
	Record<ValueType, Value>
>;
export type ValueTypeToValue<TType extends ValueType> =
	RDBValueTypeToValueMapper[TType];

export interface EncodingConfig {
	magic?: string;
	versionLength?: number;
}
