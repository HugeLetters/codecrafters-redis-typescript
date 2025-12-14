import type * as HashMap from "effect/HashMap";
import type * as HashSet from "effect/HashSet";
import type * as Record from "effect/Record";
import type * as SortedSet from "effect/SortedSet";
import type { Integer } from "$/schema/number";
import type { Satisfies } from "$/utils/type";

type PlainValue = string | Integer;
type RDBList = ReadonlyArray<PlainValue>;
type RDBSet = HashSet.HashSet<PlainValue>;

interface RDBSortedSetValue {
	readonly value: PlainValue;
	readonly order: number;
}
type RDBSortedSet = SortedSet.SortedSet<RDBSortedSetValue>;

type RDBHash = HashMap.HashMap<string, PlainValue>;
type IntSet = SortedSet.SortedSet<Integer>;

type Value = PlainValue | RDBList | RDBSet | RDBSortedSet | RDBHash | IntSet;

interface ValueWithMeta {
	readonly value: Value;
	readonly expiry: Integer | undefined;
}

type RDBDatabase = HashMap.HashMap<string, ValueWithMeta>;

interface RDBFile {
	readonly version: Integer;
	readonly meta: Record.ReadonlyRecord<string, PlainValue>;
	readonly databases: HashMap.HashMap<Integer, RDBDatabase>;
}

enum RDBValueType {
	StringEncoded = 0,
	List = 1,
	Set = 2,
	SortedSet = 3,
	Hash = 4,
	Zipmap = 9,
	Ziplist = 10,
	Intset = 11,
	ZipSortedSet = 12,
	ZipHashmap = 13,
	QuickList = 14,
}

type RDBValueTypeToValueMapper = Satisfies<
	{
		[RDBValueType.StringEncoded]: PlainValue;
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
