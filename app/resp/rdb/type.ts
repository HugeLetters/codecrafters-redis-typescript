import type * as HashMap from "effect/HashMap";
import type * as HashSet from "effect/HashSet";
import type * as SortedSet from "effect/SortedSet";
import type { Satisfies } from "$/utils/type";
import type { RDBValueType } from "./constants";

export type StringEncoded = string | bigint;

type RDBList = ReadonlyArray<StringEncoded>;
type RDBSet = HashSet.HashSet<StringEncoded>;

interface RDBSortedSetValue {
	readonly value: StringEncoded;
	readonly order: number;
}
type RDBSortedSet = SortedSet.SortedSet<RDBSortedSetValue>;

type RDBHash = HashMap.HashMap<string, StringEncoded>;
type IntSet = SortedSet.SortedSet<bigint>;

type Value = StringEncoded | RDBList | RDBSet | RDBSortedSet | RDBHash | IntSet;

interface ValueWithMeta {
	readonly value: Value;
	readonly expiry: bigint | undefined;
}

type RDBDatabase = HashMap.HashMap<string, ValueWithMeta>;

export type AuxiliaryFields = HashMap.HashMap<string, StringEncoded>;

interface RDBFile {
	readonly version: bigint;
	readonly meta: AuxiliaryFields;
	readonly databases: HashMap.HashMap<bigint, RDBDatabase>;
}

type RDBValueTypeToValueMapper = Satisfies<
	{
		[RDBValueType.StringEncoded]: StringEncoded;
		[RDBValueType.List]: RDBList;
		[RDBValueType.Set]: RDBSet;
		[RDBValueType.SortedSet]: RDBSortedSet;
		[RDBValueType.Hash]: RDBHash;
		[RDBValueType.Zipmap]: RDBHash;
		[RDBValueType.Ziplist]: RDBList;
		[RDBValueType.Intset]: IntSet;
		[RDBValueType.ZipSortedSet]: RDBSortedSet;
		[RDBValueType.ZipHashmap]: RDBHash;
		[RDBValueType.QuickList]: RDBList;
	},
	Record<RDBValueType, Value>
>;
type RDBValueTypeToValue<TType extends RDBValueType> =
	RDBValueTypeToValueMapper[TType];
