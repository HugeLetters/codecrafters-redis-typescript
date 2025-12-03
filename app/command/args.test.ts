import { describe, expect } from "bun:test";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { ParseError } from "effect/ParseResult";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { test } from "$/test";
import { CommandArg } from "./args";

describe("CommandArg", () => {
	describe("parse", () => {
		test.effect("parses multiple arguments", function* () {
			const config = {
				name: CommandArg.string(),
				surname: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(
				["surname", "Johnson", "name", "John"],
				config,
			);
			expect(result).toEqual({
				name: "John",
				surname: "Johnson",
			});
		});

		test.effect("fails on unrecognized argument", function* () {
			const config = {
				name: CommandArg.string(),
				surname: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(
				["surname", "Johnson", "unknown", "name", "John"],
				config,
			).pipe(Effect.flip);

			expect(result).toBeInstanceOf(CommandArg.Error.UnrecognizedArguments);
			expect(result.message).toContain("unknown");
		});

		test.effect("fails on excess arguments", function* () {
			const config = {
				name: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(
				["name", "John", "unknown1", "unknown2"],
				config,
			).pipe(Effect.flip);

			expect(result).toBeInstanceOf(CommandArg.Error.UnrecognizedArguments);
			expect(result.message).toContain("unknown1");
			expect(result.message).toContain("unknown2");
		});

		test.effect("fails on missing required arguments", function* () {
			const config = {
				name: CommandArg.string(),
				surname: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(
				["surname", "Johnson"],
				config,
			).pipe(Effect.flip);
			expect(result).toBeInstanceOf(CommandArg.Error.MissingArguments);
			expect(result.message).toContain("name");
		});
	});

	describe("map", () => {
		test.effect("transforms value", function* () {
			const config = {
				name: pipe(CommandArg.string(), (_) =>
					CommandArg.map(_, (s) => s.toUpperCase()),
				),
			};
			const result = yield* CommandArg.parse(["name", "hello"], config);
			expect(result.name).toBe("HELLO");
		});
	});

	describe("mapEffect", () => {
		test.effect("maps value", function* () {
			const config = {
				name: pipe(CommandArg.string(), (_) =>
					CommandArg.mapEffect(_, (s) => Effect.succeed(s.length)),
				),
			};
			const result = yield* CommandArg.parse(["name", "hello"], config);
			expect(result.name).toBe(5);
		});

		test.effect("maps default value", function* () {
			const config = {
				flag: pipe(CommandArg.flag(), (_) =>
					CommandArg.mapEffect(_, (b) => Effect.succeed(b.toString())),
				),
			};
			const result = yield* CommandArg.parse([], config);
			expect(result.flag).toBe("false");
		});

		test.effect("fails on mapEffect failure", function* () {
			const config = {
				name: pipe(CommandArg.string(), (_) =>
					CommandArg.mapEffect(_, () => Effect.fail("test error")),
				),
			};
			const result = yield* CommandArg.parse(["name", "hello"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
			expect(result.cause).toBe("test error");
		});
	});

	describe("flag", () => {
		test.effect("parses true when present", function* () {
			const config = {
				flag: CommandArg.flag(),
			};
			const result = yield* CommandArg.parse(["flag"], config);
			expect(result.flag).toBe(true);
		});

		test.effect("defaults to false when absent", function* () {
			const config = {
				flag: CommandArg.flag(),
			};
			const result = yield* CommandArg.parse([], config);
			expect(result.flag).toBe(false);
		});
	});

	describe("string", () => {
		test.effect("parses string value", function* () {
			const config = {
				name: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(["name", "John"], config);
			expect(result).toEqual({ name: "John" });
		});

		test.effect("fails if no value provided", function* () {
			const config = {
				name: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(["name"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
		});

		test.effect("fails if key not provided", function* () {
			const config = {
				name: CommandArg.string(),
				other: CommandArg.string(),
			};
			const result = yield* CommandArg.parse(["other", "value"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.MissingArguments);
			expect(result.message).toContain("name");
		});
	});

	describe("withSchema", () => {
		test.effect("parses with valid schema", function* () {
			const config = {
				age: pipe(CommandArg.string(), (_) =>
					CommandArg.withSchema(_, Schema.NumberFromString),
				),
			};
			const result = yield* CommandArg.parse(["age", "25"], config);
			expect(result.age).toBe(25);
		});

		test.effect("fails on invalid schema", function* () {
			const config = {
				age: pipe(CommandArg.string(), (_) =>
					CommandArg.withSchema(_, Schema.NumberFromString),
				),
			};
			const result = yield* CommandArg.parse(["age", "notnumber"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
			expect(result.cause).toBeInstanceOf(ParseError);
		});
	});

	describe("optional", () => {
		test.effect("parses when present", function* () {
			const config = {
				surname: pipe(CommandArg.string(), CommandArg.optional),
			};
			const result = yield* CommandArg.parse(["surname", "Doe"], config);
			expect(result.surname).toEqual(Option.some("Doe"));
		});

		test.effect("defaults to none when absent", function* () {
			const config = {
				surname: pipe(CommandArg.string(), CommandArg.optional),
			};
			const result = yield* CommandArg.parse([], config);
			expect(result.surname).toEqual(Option.none());
		});

		test.effect("fails if provided but invalid", function* () {
			const config = {
				surname: pipe(CommandArg.string(), CommandArg.optional),
			};
			const result = yield* CommandArg.parse(["surname"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
		});
	});

	describe("withDefault", () => {
		test.effect("parses when present", function* () {
			const config = {
				score: pipe(CommandArg.string(), (_) =>
					CommandArg.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandArg.parse(["score", "100"], config);
			expect(result.score).toBe("100");
		});

		test.effect("defaults when absent", function* () {
			const config = {
				score: pipe(CommandArg.string(), (_) =>
					CommandArg.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandArg.parse([], config);
			expect(result.score).toBe("zero");
		});

		test.effect("fails if provided but invalid", function* () {
			const config = {
				score: pipe(CommandArg.string(), (_) =>
					CommandArg.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandArg.parse(["score"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
		});
	});

	describe("filter", () => {
		test.effect("passes when predicate matches", function* () {
			const string = pipe(
				CommandArg.make({
					run: () => Effect.succeed({ value: "string", left: [] }),
				}),
				(_) => CommandArg.filter(_, Predicate.isString),
			);
			const config = { name: string };
			const result = yield* CommandArg.parse(["name"], config);
			expect(result.name).toBe("string");
		});

		test.effect("fails when predicate does not match", function* () {
			const string = pipe(
				CommandArg.make({
					run: () => Effect.succeed({ value: 10, left: [] }),
				}),
				(_) => CommandArg.filter(_, Predicate.isString),
			);
			const config = { name: string };
			const result = yield* CommandArg.parse(["name"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandArg.Error.InvalidArgument);
			expect(result.cause).toBeInstanceOf(Cause.NoSuchElementException);
		});
	});
});
