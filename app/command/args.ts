import * as Arr from "effect/Array";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Iterable from "effect/Iterable";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import type * as Types from "effect/Types";
import { Resp } from "$/schema/resp";

export namespace CommandArg {
	export interface ArgumentResult<T> {
		readonly value: T;
		readonly left: ReadonlyArray<Resp.RespValue> | null;
	}
	type ArgumentRunner<T, E, R> = (
		args: ReadonlyArray<Resp.RespValue>,
	) => Effect.Effect<ArgumentResult<T>, E, R>;

	export interface t<T, E = never, R = never> {
		run: ArgumentRunner<T, E, R>;
		default?: Effect.Effect<T, E, R> | undefined;
	}

	export function make<T, E = never, R = never>(
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
		return Fn.pipe(
			make({
				run([value, ...left]) {
					if (!value) {
						return new Cause.NoSuchElementException("Value is missing");
					}

					return Effect.succeed({ value, left });
				},
			}),
			(_) => filter(_, Predicate.isString),
		);
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

	export function withSchema<A, E, R, TSchema extends Schema.Schema.Any>(
		arg: t<A, E, R>,
		schema: TSchema,
	) {
		const decode = Schema.decodeUnknown(Schema.asSchema(schema));
		return mapEffect(arg, (value) => decode(value));
	}

	export function filter<A, E, R, B extends A>(
		arg: t<A, E, R>,
		predicate: Predicate.Refinement<A, B>,
	) {
		return mapEffect(arg, (value) =>
			predicate(value)
				? Effect.succeed(value)
				: new Cause.NoSuchElementException(
						`Does not match argument filter: ${Bun.inspect(value)}`,
					),
		);
	}

	export function optional<A, E, R>(arg: t<A, E, R>) {
		const out = map(arg, (v) => Option.some(v));
		out.default ??= Effect.succeed(Option.none());
		return out;
	}

	export function withDefault<A, E, R>(arg: t<A, E, R>, fallback: A) {
		return map(
			optional(arg),
			Option.getOrElse(() => fallback),
		);
	}

	export type ArgumentSchema<T, E, R> = Record.ReadonlyRecord<
		string,
		t<T, E, R>
	>;
	type ResolveArgumentConfig<
		TConfig extends ArgumentSchema<unknown, unknown, unknown>,
	> = {
		readonly [K in keyof TConfig]: TConfig[K]["run"] extends ArgumentRunner<
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
	>(args: ReadonlyArray<Resp.RespValue>, schema: TSchema) {
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
				if (!Predicate.isString(argKey)) {
					return yield* new Error.InvalidArgumentKey({ argument: argKey });
				}

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
				return yield* new Error.UnrecognizedArguments({
					arguments: remaining.map((v) => Bun.inspect(v)),
				});
			}

			return parsed as Result;
		});
	}

	export function parser<
		TSchema extends ArgumentSchema<unknown, E, R>,
		TEffect extends ArgumentSchemaEffect<TSchema>,
		E extends Effect.Effect.Error<TEffect>,
		R extends Effect.Effect.Context<TEffect>,
	>(schema: TSchema) {
		return function (args: ReadonlyArray<Resp.RespValue>) {
			return parse<TSchema, TEffect, E, R>(args, schema);
		};
	}

	export namespace Error {
		export type t<E> =
			| InvalidArgumentKey
			| InvalidArgument<E>
			| UnrecognizedArguments
			| MissingArguments;

		export class InvalidArgumentKey extends Data.TaggedError(
			"InvalidArgumentKey",
		)<{
			argument: Resp.RespValue;
		}> {
			override message =
				`Received ${Resp.format(this.argument)} key with a non-string value`;
			override cause = null;
		}

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
			override cause = null;
		}

		export class MissingArguments extends Data.TaggedError("MissingArguments")<{
			arguments: ReadonlyArray<string>;
		}> {
			override message = `Argument(s) not found: ${this.arguments.join(", ")}`;
			override cause = null;
		}

		export function format<E>(error: t<E>, format: (cause: E) => string) {
			return Match.value(error).pipe(
				Match.withReturnType<string>(),
				Match.tagsExhaustive({
					InvalidArgument(e) {
						return `${e.message}\ncaused by ${format(e.cause)}`;
					},
					InvalidArgumentKey(e) {
						return e.message;
					},
					MissingArguments(e) {
						return e.message;
					},
					UnrecognizedArguments(e) {
						return e.message;
					},
				}),
			);
		}
	}
}
