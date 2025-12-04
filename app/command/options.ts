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
import type * as SchemaAST from "effect/SchemaAST";
import type * as Types from "effect/Types";
import { Protocol } from "$/protocol";

export namespace CommandOption {
	interface OptionResult<T> {
		readonly value: T;
		readonly left: ReadonlyArray<Protocol.Decoded> | null;
	}
	type OptionRunner<T, E, R> = (
		options: ReadonlyArray<Protocol.Decoded>,
	) => Effect.Effect<OptionResult<T>, E, R>;

	export interface t<T, E = never, R = never> {
		run: OptionRunner<T, E, R>;
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

	export function single() {
		return make({
			run([value, ...left]) {
				if (value === undefined) {
					return new Cause.NoSuchElementException("Value is missing");
				}

				return Effect.succeed({ value, left });
			},
		});
	}

	export function literal<
		T extends ReadonlyArray<Protocol.Decoded & SchemaAST.LiteralValue>,
	>(...values: T) {
		return withSchema(single(), Schema.Literal(...values));
	}

	export function string() {
		return filter(single(), Predicate.isString);
	}

	export function mapEffect<A, B, E, R, E2, R2>(
		option: t<A, E, R>,
		map: (value: A) => Effect.Effect<B, E | E2, R2>,
	) {
		return make({
			run(options) {
				return option.run(options).pipe(
					Effect.bind("out", (option) => map(option.value)),
					Effect.map(({ out, left }) => ({ value: out, left })),
				);
			},
			default: option.default?.pipe(Effect.flatMap(map)),
		});
	}

	export function map<A, B, E, R>(option: t<A, E, R>, map: (value: A) => B) {
		return mapEffect(option, (value) => Effect.succeed(map(value)));
	}

	export function withSchema<A, E, R, TSchema extends Schema.Schema.Any>(
		option: t<A, E, R>,
		schema: TSchema,
	) {
		const decode = Schema.decodeUnknown(Schema.asSchema(schema));
		return mapEffect(option, (value) => decode(value));
	}

	export function filter<A, E, R, B extends A>(
		option: t<A, E, R>,
		predicate: Predicate.Refinement<A, B>,
	) {
		return mapEffect(option, (value) =>
			predicate(value)
				? Effect.succeed(value)
				: new Cause.NoSuchElementException(
						`Does not match option filter: ${Bun.inspect(value)}`,
					),
		);
	}

	export function optional<A, E, R>(option: t<A, E, R>) {
		const out = map(option, (v) => Option.some(v));
		out.default ??= Effect.succeed(Option.none());
		return out;
	}

	export function optionalOrUndefined<A, E, R>(option: t<A, E, R>) {
		return map(optional(option), Option.getOrUndefined);
	}

	export function withDefault<A, E, R>(option: t<A, E, R>, fallback: A) {
		return map(
			optional(option),
			Option.getOrElse(() => fallback),
		);
	}

	export type OptionSchema<T, E, R> = Record.ReadonlyRecord<string, t<T, E, R>>;
	type ResolveoptionConfig<
		TConfig extends OptionSchema<unknown, unknown, unknown>,
	> = {
		readonly [K in keyof TConfig]: TConfig[K]["run"] extends OptionRunner<
			infer R,
			unknown,
			unknown
		>
			? R
			: never;
	};
	type OptionSchemaEffect<
		TConfig extends OptionSchema<unknown, unknown, unknown>,
	> = Effect.Effect.AsEffect<ReturnType<TConfig[keyof TConfig]["run"]>>;

	export function parse<
		TSchema extends OptionSchema<unknown, E, R>,
		TEffect extends OptionSchemaEffect<TSchema>,
		E extends Effect.Effect.Error<TEffect>,
		R extends Effect.Effect.Context<TEffect>,
	>(options: ReadonlyArray<Protocol.Decoded>, schema: TSchema) {
		type Result = Types.Simplify<ResolveoptionConfig<TSchema>>;

		return Effect.gen(function* (): Effect.fn.Return<Result, Error.t<E>, R> {
			let remaining = options;

			const unvisitedOptions = new Map(
				Record.toEntries(schema).map(([key, option]) => [
					key.toUpperCase(),
					{
						originalKey: key,
						option,
					},
				]),
			);
			const parsed = Record.empty<string, unknown>();

			while (
				unvisitedOptions.size !== 0 &&
				Arr.isNonEmptyReadonlyArray(remaining)
			) {
				const [optionKey, ...rest] = remaining;
				if (!Predicate.isString(optionKey)) {
					return yield* new Error.InvalidOption({ option: optionKey });
				}

				const normalizedOptionKey = optionKey.toUpperCase();
				const meta = unvisitedOptions.get(normalizedOptionKey);
				unvisitedOptions.delete(normalizedOptionKey);

				if (!meta) {
					return yield* new Error.UnrecognizedOptions({
						options: [optionKey],
					});
				}

				const result = yield* meta.option.run(rest).pipe(
					Effect.mapError(
						(cause) =>
							new Error.InvalidOptionValue({
								option: meta.originalKey,
								cause,
							}),
					),
				);

				remaining = result.left ?? rest;
				parsed[meta.originalKey] = result.value;
			}

			for (const [key, meta] of unvisitedOptions) {
				if (meta.option.default) {
					unvisitedOptions.delete(key);
					parsed[meta.originalKey] = yield* meta.option.default.pipe(
						Effect.mapError(
							(cause) =>
								new Error.InvalidOptionValue({
									option: meta.originalKey,
									cause,
								}),
						),
					);
				}
			}

			if (unvisitedOptions.size !== 0) {
				return yield* new Error.MissingOptions({
					options: Fn.pipe(
						unvisitedOptions.values(),
						Iterable.map((meta) => meta.originalKey),
						Arr.fromIterable,
					),
				});
			}

			if (Arr.isNonEmptyReadonlyArray(remaining)) {
				return yield* new Error.UnrecognizedOptions({
					options: remaining.map((v) => Bun.inspect(v)),
				});
			}

			return parsed as Result;
		});
	}

	export function parser<
		TSchema extends OptionSchema<unknown, E, R>,
		TEffect extends OptionSchemaEffect<TSchema>,
		E extends Effect.Effect.Error<TEffect>,
		R extends Effect.Effect.Context<TEffect>,
	>(schema: TSchema) {
		return function (options: ReadonlyArray<Protocol.Decoded>) {
			return parse<TSchema, TEffect, E, R>(options, schema);
		};
	}

	export namespace Error {
		export type t<E> =
			| InvalidOption
			| InvalidOptionValue<E>
			| UnrecognizedOptions
			| MissingOptions;

		export class InvalidOption extends Data.TaggedError("InvalidOptionKey")<{
			option: Protocol.Decoded;
		}> {
			override message =
				`Received ${Protocol.format(this.option)} key with a non-string value`;
			override cause = null;
		}

		export class InvalidOptionValue<E> extends Data.TaggedError(
			"InvalidOption",
		)<{
			option: string;
			cause: E;
		}> {
			override message = `Error while parsing option: ${this.option}`;
		}

		export class UnrecognizedOptions extends Data.TaggedError(
			"UnrecognizedOptions",
		)<{
			options: ReadonlyArray<string>;
		}> {
			override message = `Unexpected option(s): ${this.options.join(", ")}`;
			override cause = null;
		}

		export class MissingOptions extends Data.TaggedError("MissingOptions")<{
			options: ReadonlyArray<string>;
		}> {
			override message = `Option(s) not found: ${this.options.join(", ")}`;
			override cause = null;
		}

		export function format<E>(error: t<E>, format: (cause: E) => string) {
			return Match.value(error).pipe(
				Match.withReturnType<string>(),
				Match.tagsExhaustive({
					InvalidOption(e) {
						return `${e.message}\ncaused by ${format(e.cause)}`;
					},
					InvalidOptionKey(e) {
						return e.message;
					},
					MissingOptions(e) {
						return e.message;
					},
					UnrecognizedOptions(e) {
						return e.message;
					},
				}),
			);
		}
	}
}
