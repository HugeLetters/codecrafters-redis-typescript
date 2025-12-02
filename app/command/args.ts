import * as Arr from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Iterable from "effect/Iterable";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type * as Types from "effect/Types";

export namespace CommandArg {
	export interface ArgumentResult<T> {
		readonly value: T;
		readonly left: ReadonlyArray<string> | null;
	}
	type RunArgument<T, E, R> = (
		args: ReadonlyArray<string>,
	) => Effect.Effect<ArgumentResult<T>, E, R>;

	export interface t<T, E = never, R = never> {
		run: RunArgument<T, E, R>;
		default?: Effect.Effect<T, E, R> | undefined;
	}

	export function make<T = never, E = never, R = never>(
		config: t<T, E, R>,
	): t<T, E, R> {
		return config;
	}

	export function flag() {
		return make({
			run(left) {
				return Effect.succeed({ value: true, left });
			},
			default: Effect.succeed(false),
		});
	}

	export function string() {
		return make({
			run([value, ...left]) {
				return Option.fromNullable(value).pipe(
					Option.map((value) => ({ value, left })),
				);
			},
		});
	}

	export function mapEffect<A, B, E, R, E2, R2>(
		arg: t<A, E, R>,
		map: (value: A) => Effect.Effect<B, E | E2, R2>,
	) {
		return make({
			run(args) {
				return arg.run(args).pipe(
					Effect.bind("out", (arg) => map(arg.value)),
					Effect.map(({ out, left }) => ({ value: out, left })),
				);
			},
			default: arg.default?.pipe(Effect.flatMap(map)),
		});
	}

	export function map<A, B, E, R>(arg: t<A, E, R>, map: (value: A) => B) {
		return mapEffect(arg, (value) => Effect.succeed(map(value)));
	}

	export function withSchema<A, B, E, R, R2>(
		arg: t<A, E, R>,
		schema: Schema.Schema<B, A, R2>,
	) {
		const decode = Schema.decode(schema);
		return mapEffect(arg, (value) => decode(value));
	}

	export function optional<I, E, R>(arg: t<I, E, R>) {
		const out = map(arg, (v) => Option.some(v));
		out.default ??= Effect.succeed(Option.none());
		return out;
	}

	export function withDefault<I, E, R>(arg: t<I, E, R>, fallback: I) {
		return map(
			optional(arg),
			Option.getOrElse(() => fallback),
		);
	}

	type ArgumentSchema<T, E, R> = Record.ReadonlyRecord<string, t<T, E, R>>;
	type ResolveArgumentConfig<
		TConfig extends ArgumentSchema<unknown, unknown, unknown>,
	> = {
		readonly [K in keyof TConfig]: TConfig[K]["run"] extends RunArgument<
			infer R,
			unknown,
			unknown
		>
			? R
			: never;
	};
	type ArgumentSchemaEffect<
		TConfig extends ArgumentSchema<unknown, unknown, unknown>,
	> = Effect.Effect.AsEffect<ReturnType<TConfig[keyof TConfig]["run"]>>;

	export function parse<
		TSchema extends ArgumentSchema<unknown, E, R>,
		TEffect extends ArgumentSchemaEffect<TSchema>,
		E extends Effect.Effect.Error<TEffect>,
		R extends Effect.Effect.Context<TEffect>,
	>(args: ReadonlyArray<string>, schema: TSchema) {
		type Result = Types.Simplify<ResolveArgumentConfig<TSchema>>;

		return Effect.gen(function* (): Effect.fn.Return<Result, Error.t<E>, R> {
			let remaining = args;

			const unvisitedArgs = new Map(
				Record.toEntries(schema).map(([key, arg]) => [
					key.toUpperCase(),
					{
						originalKey: key,
						arg,
					},
				]),
			);
			const parsed = Record.empty<string, unknown>();

			while (
				unvisitedArgs.size !== 0 &&
				Arr.isNonEmptyReadonlyArray(remaining)
			) {
				const [argKey, ...rest] = remaining;

				const normalizedArgKey = argKey.toUpperCase();
				const meta = unvisitedArgs.get(normalizedArgKey);
				unvisitedArgs.delete(normalizedArgKey);

				if (!meta) {
					return yield* new Error.UnrecognizedArguments({
						arguments: [argKey],
					});
				}

				const result = yield* meta.arg.run(rest).pipe(
					Effect.mapError(
						(cause) =>
							new Error.InvalidArgument({
								argument: meta.originalKey,
								cause,
							}),
					),
				);

				remaining = result.left ?? rest;
				parsed[meta.originalKey] = result.value;
			}

			for (const [key, meta] of unvisitedArgs) {
				if (meta.arg.default) {
					unvisitedArgs.delete(key);
					parsed[meta.originalKey] = yield* meta.arg.default.pipe(
						Effect.mapError(
							(cause) =>
								new Error.InvalidArgument({
									argument: meta.originalKey,
									cause,
								}),
						),
					);
				}
			}

			if (unvisitedArgs.size !== 0) {
				return yield* new Error.MissingArguments({
					arguments: Fn.pipe(
						unvisitedArgs.values(),
						Iterable.map((meta) => meta.originalKey),
						Arr.fromIterable,
					),
				});
			}

			if (Arr.isNonEmptyReadonlyArray(remaining)) {
				return yield* new Error.UnrecognizedArguments({ arguments: remaining });
			}

			return parsed as Result;
		});
	}

	export namespace Error {
		export type t<E> =
			| InvalidArgument<E>
			| UnrecognizedArguments
			| MissingArguments;

		export class InvalidArgument<E> extends Data.TaggedError(
			"InvalidArgument",
		)<{
			argument: string;
			cause: E;
		}> {
			override message = `Error while parsing argument: ${this.argument}`;
		}

		export class UnrecognizedArguments extends Data.TaggedError(
			"UnrecognizedArguments",
		)<{
			arguments: ReadonlyArray<string>;
		}> {
			override message = `Unexpected argument(s): ${this.arguments.join(", ")}`;
		}

		export class MissingArguments extends Data.TaggedError("MissingArguments")<{
			arguments: ReadonlyArray<string>;
		}> {
			override message = `Argument(s) not found: ${this.arguments.join(", ")}`;
		}
	}
}
