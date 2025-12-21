import * as Arr from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Differ from "effect/Differ";
import * as Equal from "effect/Equal";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type { BuiltInDiffer } from "./internal";

namespace PlainDiffer {
	class EmptyPatch extends Data.TaggedClass("Empty") {}
	class ReplacePatch extends Data.TaggedClass("Replace")<{
		value: unknown;
	}> {}

	export type Patch = EmptyPatch | ReplacePatch;

	export const empty = new EmptyPatch();

	export const differ = Differ.make<unknown, Patch>({
		combine(_first, second) {
			return second;
		},
		diff(oldValue, newValue) {
			if (Equal.equals(oldValue, newValue)) {
				return empty;
			}

			return new ReplacePatch({ value: newValue });
		},
		empty,
		patch(patch, oldValue) {
			switch (patch._tag) {
				case "Empty":
					return oldValue;
				case "Replace":
					return patch.value;
				default:
					patch satisfies never;
					return oldValue;
			}
		},
	});
}

namespace RecordDiffer {
	export type Patch<Value, Patch> = BuiltInDiffer.HashMap.Patch<
		string,
		Value,
		Patch
	>;

	export const make = <Value, Patch>(differ: Differ.Differ<Value, Patch>) => {
		const hmDiffer = Differ.hashMap<string, Value, Patch>(differ);

		return Differ.make({
			empty: hmDiffer.empty,
			diff: (oldValue: Record.ReadonlyRecord<string, Value>, newValue) => {
				const oldHm = HashMap.fromIterable(Object.entries(oldValue));
				const newHm = HashMap.fromIterable(Object.entries(newValue));
				return hmDiffer.diff(oldHm, newHm);
			},
			combine: hmDiffer.combine,
			patch: (patch, oldValue) => {
				const oldHm = HashMap.fromIterable(Object.entries(oldValue));
				const patched = hmDiffer.patch(patch, oldHm);
				return Data.struct(Record.fromEntries(patched));
			},
		});
	};
}

export namespace UnknownDiffer {
	class EmptyPatch extends Data.TaggedClass("Empty") {}
	class AndThen extends Data.TaggedClass("AndThen")<{
		readonly first: Patch;
		readonly second: Patch;
	}> {}

	class PlainPatch extends Data.TaggedClass("Plain")<{
		readonly patch: PlainDiffer.Patch;
	}> {}
	class ArrayPatch extends Data.TaggedClass("Array")<{
		readonly patch: BuiltInDiffer.Array.Patch<unknown, Patch>;
	}> {}
	class ChunkPatch extends Data.TaggedClass("Chunk")<{
		readonly patch: BuiltInDiffer.Chunk.Patch<unknown, Patch>;
	}> {}
	class RecordPatch extends Data.TaggedClass("Record")<{
		readonly patch: RecordDiffer.Patch<unknown, Patch>;
	}> {}
	class HashMapPatch extends Data.TaggedClass("HashMap")<{
		readonly patch: BuiltInDiffer.HashMap.Patch<unknown, unknown, Patch>;
	}> {}
	class HashSetPatch extends Data.TaggedClass("HashSet")<{
		readonly patch: BuiltInDiffer.HashSet.Patch<unknown>;
	}> {}

	export type Patch =
		| EmptyPatch
		| AndThen
		| PlainPatch
		| ArrayPatch
		| ChunkPatch
		| RecordPatch
		| HashMapPatch
		| HashSetPatch;

	function pair<V>(predicate: V) {
		return [predicate, predicate] as const;
	}

	export const differ: Differ.Differ<unknown, Patch> = Differ.make<
		unknown,
		Patch
	>({
		empty: new EmptyPatch(),

		diff(oldValue, newValue) {
			return Match.value([oldValue, newValue]).pipe(
				Match.when(pair(ValueHelpers.chunk.matcher), ([oldValue, newValue]) => {
					const patch = ValueHelpers.chunk.differ.diff(
						oldValue,
						newValue,
					) as ChunkPatch["patch"];

					if (patch._tag === "Empty") {
						return differ.empty;
					}

					return new ChunkPatch({
						patch: patch,
					});
				}),
				Match.when(
					pair(ValueHelpers.hashMap.matcher),
					([oldValue, newValue]) => {
						const patch = ValueHelpers.hashMap.differ.diff(
							oldValue,
							newValue,
						) as HashMapPatch["patch"];

						if (patch._tag === "Empty") {
							return differ.empty;
						}

						return new HashMapPatch({
							patch: patch,
						});
					},
				),
				Match.when(
					pair(ValueHelpers.hashSet.matcher),
					([oldValue, newValue]) => {
						const patch = ValueHelpers.hashSet.differ.diff(
							oldValue,
							newValue,
						) as HashSetPatch["patch"];

						if (patch._tag === "Empty") {
							return differ.empty;
						}

						return new HashSetPatch({
							patch: patch,
						});
					},
				),
				Match.when(pair(ValueHelpers.array.matcher), ([oldValue, newValue]) => {
					const patch = ValueHelpers.array.differ.diff(
						oldValue,
						newValue,
					) as ArrayPatch["patch"];

					if (patch._tag === "Empty") {
						return differ.empty;
					}

					return new ArrayPatch({
						patch: patch,
					});
				}),
				Match.when(
					pair(ValueHelpers.record.matcher),
					([oldValue, newValue]) => {
						const patch = ValueHelpers.record.differ.diff(
							oldValue,
							newValue,
						) as RecordPatch["patch"];

						if (patch._tag === "Empty") {
							return differ.empty;
						}

						return new RecordPatch({ patch });
					},
				),
				Match.orElse(([oldValue, newValue]) => {
					const patch = ValueHelpers.plain.differ.diff(oldValue, newValue);
					if (patch._tag === "Empty") {
						return differ.empty;
					}

					return new PlainPatch({ patch: patch });
				}),
			);
		},

		combine(first, second) {
			if (first._tag === "Empty") {
				return second;
			}

			if (second._tag === "Empty") {
				return first;
			}

			return new AndThen({ first, second });
		},

		patch(patch, oldValue) {
			switch (patch._tag) {
				case "Empty":
					return oldValue;
				case "AndThen": {
					const firstResult = differ.patch(patch.first, oldValue);
					return differ.patch(patch.second, firstResult);
				}
				case "Plain":
					return ValueHelpers.plain.differ.patch(patch.patch, oldValue);
				case "Chunk":
					if (!ValueHelpers.chunk.matcher(oldValue)) {
						return oldValue;
					}

					return ValueHelpers.chunk.differ.patch(patch.patch, oldValue);
				case "HashMap":
					if (!ValueHelpers.hashMap.matcher(oldValue)) {
						return oldValue;
					}

					return ValueHelpers.hashMap.differ.patch(patch.patch, oldValue);
				case "HashSet":
					if (!ValueHelpers.hashSet.matcher(oldValue)) {
						return oldValue;
					}

					return ValueHelpers.hashSet.differ.patch(patch.patch, oldValue);
				case "Array":
					if (!ValueHelpers.array.matcher(oldValue)) {
						return oldValue;
					}

					return ValueHelpers.array.differ.patch(patch.patch, oldValue);
				case "Record":
					if (!ValueHelpers.record.matcher(oldValue)) {
						return oldValue;
					}

					return ValueHelpers.record.differ.patch(patch.patch, oldValue);
				default:
					patch satisfies never;
					return oldValue;
			}
		},
	});

	const ValueHelpers = {
		array: {
			matcher: (v: unknown) => Arr.isArray(v),
			differ: Differ.readonlyArray(differ),
		},
		chunk: {
			matcher: Chunk.isChunk,
			differ: Differ.chunk(differ),
		},
		hashMap: {
			matcher: HashMap.isHashMap,
			differ: Differ.hashMap(differ),
		},
		hashSet: {
			matcher: HashSet.isHashSet,
			differ: Differ.hashSet(),
		},
		record: {
			matcher: Predicate.isReadonlyRecord,
			differ: RecordDiffer.make(differ),
		},
		plain: {
			differ: PlainDiffer.differ,
		},
	};

	export function format(patch: Patch): string {
		switch (patch._tag) {
			case "Empty":
				return "UnknownEmpty()";
			case "AndThen":
				return `UnknownAndThen(${format(patch.first)}, ${format(patch.second)})`;
			case "Plain":
				return `Plain(${formatPlain(patch.patch)})`;
			case "Array":
				return `Array(${formatArray(patch.patch)})`;
			case "Chunk":
				return `Chunk(${formatChunk(patch.patch)})`;
			case "Record":
				return `Record(${formatRecord(patch.patch)})`;
			case "HashMap":
				return `HashMap(${formatHashMap(patch.patch)})`;
			case "HashSet":
				return `HashSet(${formatHashSet(patch.patch)})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatPlain(patch: PlainPatch["patch"]) {
		switch (patch._tag) {
			case "Empty":
				return "PlainEmpty()";
			case "Replace":
				return `Replace(${patch.value})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatArray(patch: ArrayPatch["patch"]): string {
		switch (patch._tag) {
			case "Empty":
				return "ArrayEmpty()";
			case "AndThen":
				return `ArrayAndThen(${formatArray(patch.first)} -> ${formatArray(patch.second)})`;
			case "Append":
				return `Appended(${patch.values.join(", ")})`;
			case "Slice":
				return `Slice(${patch.from} - ${patch.until})`;
			case "Update":
				return `Update(${patch.index}: ${format(patch.patch)})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatChunk(patch: ChunkPatch["patch"]): string {
		switch (patch._tag) {
			case "Empty":
				return "ChunkEmpty()";
			case "AndThen":
				return `ChunkAndThen(${formatChunk(patch.first)} -> ${formatChunk(patch.second)})`;
			case "Append":
				return `Appended(${patch.values.join(", ")})`;
			case "Slice":
				return `Slice(${patch.from} - ${patch.until})`;
			case "Update":
				return `Update(${patch.index}: ${format(patch.patch)})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatRecord(patch: RecordPatch["patch"]): string {
		switch (patch._tag) {
			case "Empty":
				return "RecordEmpty()";
			case "AndThen":
				return `RecordAndThen(${formatRecord(patch.first)} -> ${formatRecord(patch.second)})`;
			case "Remove":
				return `Remove(${patch.key})`;
			case "Add":
				return `Add(${patch.key}: ${patch.value})`;
			case "Update":
				return `Update(${patch.key}: ${format(patch.patch)})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatHashMap(patch: HashMapPatch["patch"]): string {
		switch (patch._tag) {
			case "Empty":
				return "HashMapEmpty()";
			case "AndThen":
				return `HashMapAndThen(${formatHashMap(patch.first)}, ${formatHashMap(patch.second)})`;
			case "Remove":
				return `Remove(${patch.key})`;
			case "Add":
				return `Add(${patch.key} ~> ${patch.value})`;
			case "Update":
				return `Update(${patch.key} ~> ${format(patch.patch)})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}

	function formatHashSet(patch: HashSetPatch["patch"]): string {
		switch (patch._tag) {
			case "Empty":
				return "HashSetEmpty()";
			case "AndThen":
				return `HashSetAndThen(${formatHashSet(patch.first)} -> ${formatHashSet(patch.second)})`;
			case "Add":
				return `Add(${patch.value})`;
			case "Remove":
				return `Remove(${patch.value})`;
			default:
				patch satisfies never;
				return "UnknownPatch";
		}
	}
}
