import type * as HashMap from "effect/HashMap";
import type * as HashSet from "effect/HashSet";
import type * as SortedSet from "effect/SortedSet";
import type { Satisfies } from "$/utils/type";
import type { ValueType } from "./constants";

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

export type Value =
	| StringEncoded
	| RDBList
	| RDBSet
	| RDBSortedSet
	| RDBHash
	| IntSet;

interface ValueWithMeta {
	readonly value: Value;
	readonly expiry: bigint | null;
}

export interface DatabaseMeta {
	readonly hashSize: bigint;
	readonly expireHashSize: bigint;
}

export type DatabaseEntries = HashMap.HashMap<string, ValueWithMeta>;
export interface Database {
	readonly meta: DatabaseMeta | null;
	readonly entries: DatabaseEntries;
}
export type Databases = HashMap.HashMap<bigint, Database>;

export type AuxiliaryFields = HashMap.HashMap<string, StringEncoded>;

export interface RDBFile {
	readonly version: bigint;
	readonly meta: AuxiliaryFields;
	readonly databases: Databases;
}

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
type RDBValueTypeToValue<TType extends ValueType> =
	RDBValueTypeToValueMapper[TType];
