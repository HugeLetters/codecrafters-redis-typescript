import { argv } from "bun";
import {
	Array as Arr,
	type Config as C,
	ConfigError,
	ConfigProvider,
	ConfigProviderPathPatch,
	Effect,
	Either,
	HashMap,
	HashSet,
	Iterable,
	Match,
	Option,
	pipe,
} from "effect";

interface ArgvConfigProviderOptions {
	/** @default "." */
	pathDelim: string;
}

const DefaultOptions: ArgvConfigProviderOptions = {
	pathDelim: ".",
};

export function argvConfigProvider(
	options?: Partial<ArgvConfigProviderOptions>,
) {
	const { pathDelim } = Object.assign({}, DefaultOptions, options);
	const args = parseArgv();

	const flatProvider = ConfigProvider.makeFlat({
		load(path_, primitive, split) {
			const path = [...path_];
			const pathString = Arr.join(path, pathDelim);
			const value = HashMap.get(args, pathString);
			return value.pipe(
				Effect.mapError(() =>
					ConfigError.MissingData(
						path,
						`Expected ${pathString} to exist in the process context`,
					),
				),
				Effect.flatMap((value) => {
					return split
						? parsePrimitive(value, path, primitive)
						: parseSplitPrimitive(value, path, primitive);
				}),
			);
		},
		enumerateChildren(path) {
			return Effect.sync(() => {
				return pipe(
					args,
					HashMap.keys,
					Iterable.map((value) => value.split(pathDelim)),
					Iterable.filter((keyPath) => {
						for (let i = 0; i < path.length; i++) {
							const component = path[i];
							const current = keyPath[i];
							if (current === undefined || component !== current) {
								return false;
							}
						}

						return true;
					}),
					Iterable.flatMap((keyPath) =>
						keyPath.slice(path.length, path.length + 1),
					),
					HashSet.fromIterable,
				);
			});
		},
		patch: ConfigProviderPathPatch.empty,
	});

	return ConfigProvider.fromFlat(flatProvider);
}

function parsePrimitive<A>(
	text: ReadonlyArray<string>,
	path: Array<string>,
	primitive: C.Config.Primitive<A>,
) {
	return primitive.parse(text.join(" ")).pipe(
		Either.mapBoth({
			onLeft: ConfigError.prefixed(path),
			onRight: Arr.of,
		}),
	);
}

function parseSplitPrimitive<A>(
	text: ReadonlyArray<string>,
	path: Array<string>,
	primitive: C.Config.Primitive<A>,
) {
	return pipe(
		text,
		Arr.map((char) => primitive.parse(char.trim())),
		Effect.all,
		Effect.mapError(ConfigError.prefixed(path)),
	);
}

function parseArgv() {
	const args = HashMap.empty<string, ReadonlyArray<string>>();
	const currentKey = Option.none<string>();
	const result = Iterable.reduce(
		argv.slice(2),
		{ args, currentKey },
		(acc, chunk) => {
			if (chunk.startsWith("-")) {
				const currentKey = chunk.replace(/^\-{1,2}/, "");
				const value = HashMap.get(acc.args, currentKey);
				const args = Option.isSome(value)
					? acc.args
					: HashMap.set(acc.args, currentKey, []);

				return {
					args,
					currentKey: Option.some(currentKey),
				};
			}

			if (Option.isSome(acc.currentKey)) {
				const currentKey = acc.currentKey.value;
				const value = HashMap.get(acc.args, currentKey).pipe(
					Option.map(Arr.append(chunk)),
					Option.getOrElse(() => [chunk] as const),
				);

				return {
					currentKey: acc.currentKey,
					args: HashMap.set(acc.args, currentKey, value),
				};
			}

			return acc;
		},
	);

	return result.args.pipe(
		HashMap.map(
			Match.type<ReadonlyArray<string>>().pipe(
				Match.when(Arr.isEmptyReadonlyArray, () => ["true"] as const),
				Match.orElse((x) => x),
			),
		),
	);
}
