import { inspect } from "node:util";
import { regex } from "arkregex";
import * as Arr from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Differ from "effect/Differ";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type { BuiltInDiffer } from "./internal";

namespace PlainDiffer {
	class EmptyPatch extends Data.TaggedClass("Empty") {}
	class ReplacePatch extends Data.TaggedClass("Replace")<{
		from: Value;
		to: Value;
	}> {}

	export type Patch = EmptyPatch | ReplacePatch;

	export type Value = unknown;

	export const empty = new EmptyPatch();

	export const differ = Differ.make<Value, Patch>({
		combine(_first, second) {
			return second;
		},
		diff(oldValue, newValue) {
			if (Equal.equals(oldValue, newValue)) {
				return empty;
			}

			return new ReplacePatch({ from: oldValue, to: newValue });
		},
		empty,
		patch(patch, oldValue) {
			switch (patch._tag) {
				case "Empty":
					return oldValue;
				case "Replace":
					return patch.to;
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

	export type Value<TValue = unknown> = Record.ReadonlyRecord<string, TValue>;

	export const make = <Value, Patch>(differ: Differ.Differ<Value, Patch>) => {
		const hmDiffer = Differ.hashMap<string, Value, Patch>(differ);

		return Differ.make({
			empty: hmDiffer.empty,
			diff: (oldValue: RecordDiffer.Value<Value>, newValue) => {
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

					return new ChunkPatch({ patch });
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

						return new HashMapPatch({ patch });
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

						return new HashSetPatch({ patch });
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

					return new ArrayPatch({ patch });
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

					return new PlainPatch({ patch });
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
	export namespace Formatter {
		export function format(patch: Patch): string {
			const tree = makeUnknownTree(patch);
			return drawTree(tree);
		}

		interface EmptyPatch {
			readonly _tag: "Empty";
		}

		interface NestedPatch {
			readonly _tag: "Nested";
			readonly label: string;
			readonly patch: PatchTree;
		}

		interface SequencePatch {
			readonly _tag: "Sequence";
			readonly patch: Chunk.Chunk<PatchTree>;
		}

		interface UnitPatch {
			readonly _tag: "Unit";
			readonly content: string;
		}

		type PatchTree = EmptyPatch | UnitPatch | NestedPatch | SequencePatch;

		const empty: PatchTree = { _tag: "Empty" };

		const ItemPrefix = "├──";
		const LastPrefix = "└──";
		const LinePrefix = "│  ";
		const AfterLastPrefix = "   ";
		interface TreeMeta {
			prefix: {
				item: string;
				line: string;
				last: string;
				afterLast: string;
			};
		}
		function drawTree(
			tree: PatchTree,
			meta: TreeMeta = {
				prefix: {
					item: "",
					last: "",
					line: "",
					afterLast: "",
				},
			},
		): string {
			const { prefix } = meta;
			switch (tree._tag) {
				case "Empty":
					return `${prefix.last}<unchanged>`;
				case "Unit":
					return `${prefix.last}${tree.content}`;
				case "Sequence": {
					const nonEmptyPatches = tree.patch.pipe(
						flattenSequence,
						Chunk.filter((tree) => tree._tag !== "Empty"),
					);

					if (Chunk.isEmpty(nonEmptyPatches)) {
						return `${prefix.last}${drawTree(empty)}`;
					}

					return nonEmptyPatches.pipe(
						Chunk.map((tree, i) => {
							const isLast = i === nonEmptyPatches.length - 1;
							return `${drawTree(tree, {
								prefix: {
									...prefix,
									line: isLast
										? prefix.line
										: prefix.line.replace(
												regex(`${AfterLastPrefix}$`),
												LinePrefix,
											),
									last: isLast ? prefix.last : prefix.item,
								},
							})}`;
						}),
						Chunk.join("\n"),
					);
				}
				case "Nested": {
					const patch = drawTree(tree.patch, {
						prefix: {
							item: `${prefix.line}${ItemPrefix}`,
							line: `${prefix.line}${AfterLastPrefix}`,
							last: `${prefix.line}${LastPrefix}`,
							afterLast: `${prefix.line}${AfterLastPrefix}`,
						},
					});
					return `${prefix.last}${tree.label}\n${patch}`;
				}
				default:
					tree satisfies never;
					return `UnknownTree`;
			}
		}

		function flattenSequence(
			patches: Chunk.Chunk<PatchTree>,
		): Chunk.Chunk<Exclude<PatchTree, SequencePatch>> {
			return Chunk.flatMap(patches, (tree) => {
				if (tree._tag !== "Sequence") {
					return Chunk.of(tree);
				}

				return flattenSequence(tree.patch);
			});
		}

		function makeUnknownTree(patch: Patch): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "AndThen": {
					const first = makeUnknownTree(patch.first);
					const second = makeUnknownTree(patch.second);
					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Plain": {
					return makePlainTree(patch.patch);
				}
				case "Array": {
					const tree = makeArrayTree(patch.patch);

					return {
						_tag: "Nested",
						label: "Array",
						patch: tree,
					};
				}
				case "Chunk": {
					const tree = makeChunkTree(patch.patch);
					return {
						_tag: "Nested",
						label: "Chunk",
						patch: tree,
					};
				}
				case "Record": {
					const tree = makeRecordTree(patch.patch);
					return {
						_tag: "Nested",
						label: "Record",
						patch: tree,
					};
				}
				case "HashMap": {
					const tree = makeHashMapTree(patch.patch);
					return {
						_tag: "Nested",
						label: "HashMap",
						patch: tree,
					};
				}
				case "HashSet": {
					const tree = makeHashSetTree(patch.patch);
					return {
						_tag: "Nested",
						label: "HashSet",
						patch: tree,
					};
				}
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makePlainTree(patch: PlainPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "Replace":
					return {
						_tag: "Unit",
						content: `Replaced(${formatValue(patch.from)} -> ${formatValue(patch.to)})`,
					};
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makeArrayTree(patch: ArrayPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;

				case "AndThen": {
					const first = makeArrayTree(patch.first);
					const second = makeArrayTree(patch.second);
					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Append":
					return {
						_tag: "Sequence",
						patch: pipe(
							patch.values,
							Chunk.fromIterable,
							Chunk.map((value) => ({
								_tag: "Unit",
								content: `Appended ${formatValue(value)}`,
							})),
						),
					};
				case "Slice":
					return {
						_tag: "Unit",
						content: `Slice(${patch.from} - ${patch.until})`,
					};
				case "Update": {
					const tree = makeUnknownTree(patch.patch);
					return {
						_tag: "Nested",
						label: `Updated: ${patch.index}`,
						patch: tree,
					};
				}
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makeChunkTree(patch: ChunkPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "AndThen": {
					const first = makeChunkTree(patch.first);
					const second = makeChunkTree(patch.second);
					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Append":
					return {
						_tag: "Sequence",
						patch: Chunk.map(patch.values, (value) => ({
							_tag: "Unit",
							content: `Appended ${formatValue(value)}`,
						})),
					};
				case "Slice":
					return {
						_tag: "Unit",
						content: `Slice(${patch.from} - ${patch.until})`,
					};
				case "Update": {
					const tree = makeUnknownTree(patch.patch);
					return {
						_tag: "Nested",
						label: `Updated: ${patch.index}`,
						patch: tree,
					};
				}
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makeRecordTree(patch: RecordPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "AndThen": {
					const first = makeRecordTree(patch.first);
					const second = makeRecordTree(patch.second);
					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Remove":
					return {
						_tag: "Unit",
						content: `Remove(${patch.key})`,
					};
				case "Add":
					return {
						_tag: "Unit",
						content: `Add(${patch.key}: ${formatValue(patch.value)})`,
					};
				case "Update": {
					const tree = makeUnknownTree(patch.patch);
					return {
						_tag: "Nested",
						label: `Updated: ${patch.key}`,
						patch: tree,
					};
				}
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makeHashMapTree(patch: HashMapPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "AndThen": {
					const first = makeHashMapTree(patch.first);
					const second = makeHashMapTree(patch.second);

					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Remove":
					return {
						_tag: "Unit",
						content: `Remove(${formatValue(patch.key)})`,
					};
				case "Add":
					return {
						_tag: "Unit",
						content: `Add(${formatValue(patch.key)} ~> ${formatValue(patch.value)})`,
					};
				case "Update": {
					const tree = makeUnknownTree(patch.patch);
					return {
						_tag: "Nested",
						label: `Updated: ${formatValue(patch.key)}`,
						patch: tree,
					};
				}
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function makeHashSetTree(patch: HashSetPatch["patch"]): PatchTree {
			switch (patch._tag) {
				case "Empty":
					return empty;
				case "AndThen": {
					const first = makeHashSetTree(patch.first);
					const second = makeHashSetTree(patch.second);
					return {
						_tag: "Sequence",
						patch: Chunk.make(first, second),
					};
				}
				case "Add":
					return {
						_tag: "Unit",
						content: `Add(${formatValue(patch.value)})`,
					};
				case "Remove":
					return {
						_tag: "Unit",
						content: `Remove(${formatValue(patch.value)})`,
					};
				default:
					patch satisfies never;
					return {
						_tag: "Unit",
						content: "UnknownPatch",
					};
			}
		}

		function formatValue(value: unknown) {
			return inspect(value, {
				compact: true,
				colors: true,
				depth: 0,
				maxArrayLength: 0,
				maxStringLength: 10,
				breakLength: Number.POSITIVE_INFINITY,
			});
		}
	}
}
