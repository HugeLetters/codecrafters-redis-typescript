import { describe, expect } from "bun:test";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { ParseError } from "effect/ParseResult";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { test } from "$/test";
import { CommandOption } from "./options";

describe("CommandOptions", () => {
	describe("parse", () => {
		test.effect("parses multiple options", function* () {
			const config = {
				name: CommandOption.string(),
				surname: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(
				["surname", "Johnson", "name", "John"],
				config,
			);
			expect(result).toEqual({
				name: "John",
				surname: "Johnson",
			});
		});

		test.effect("fails on unrecognized option", function* () {
			const config = {
				name: CommandOption.string(),
				surname: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(
				["surname", "Johnson", "unknown", "name", "John"],
				config,
			).pipe(Effect.flip);

			expect(result).toBeInstanceOf(CommandOption.Error.UnrecognizedOptions);
			expect(result.message).toContain("unknown");
		});

		test.effect("fails on excess options", function* () {
			const config = {
				name: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(
				["name", "John", "unknown1", "unknown2"],
				config,
			).pipe(Effect.flip);

			expect(result).toBeInstanceOf(CommandOption.Error.UnrecognizedOptions);
			expect(result.message).toContain("unknown1");
			expect(result.message).toContain("unknown2");
		});

		test.effect("fails on missing required options", function* () {
			const config = {
				name: CommandOption.string(),
				surname: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(
				["surname", "Johnson"],
				config,
			).pipe(Effect.flip);
			expect(result).toBeInstanceOf(CommandOption.Error.MissingOptions);
			expect(result.message).toContain("name");
		});
	});

	describe("map", () => {
		test.effect("transforms value", function* () {
			const config = {
				name: pipe(CommandOption.string(), (_) =>
					CommandOption.map(_, (s) => s.toUpperCase()),
				),
			};
			const result = yield* CommandOption.parse(["name", "hello"], config);
			expect(result.name).toBe("HELLO");
		});
	});

	describe("mapEffect", () => {
		test.effect("maps value", function* () {
			const config = {
				name: pipe(CommandOption.string(), (_) =>
					CommandOption.mapEffect(_, (s) => Effect.succeed(s.length)),
				),
			};
			const result = yield* CommandOption.parse(["name", "hello"], config);
			expect(result.name).toBe(5);
		});

		test.effect("maps default value", function* () {
			const config = {
				flag: pipe(CommandOption.flag(), (_) =>
					CommandOption.mapEffect(_, (b) => Effect.succeed(b.toString())),
				),
			};
			const result = yield* CommandOption.parse([], config);
			expect(result.flag).toBe("false");
		});

		test.effect("fails on mapEffect failure", function* () {
			const config = {
				name: pipe(CommandOption.string(), (_) =>
					CommandOption.mapEffect(_, () => Effect.fail("test error")),
				),
			};
			const result = yield* CommandOption.parse(["name", "hello"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
			expect(result.cause).toBe("test error");
		});
	});

	describe("flag", () => {
		test.effect("parses true when present", function* () {
			const config = {
				flag: CommandOption.flag(),
			};
			const result = yield* CommandOption.parse(["flag"], config);
			expect(result.flag).toBe(true);
		});

		test.effect("defaults to false when absent", function* () {
			const config = {
				flag: CommandOption.flag(),
			};
			const result = yield* CommandOption.parse([], config);
			expect(result.flag).toBe(false);
		});
	});

	describe("string", () => {
		test.effect("parses string value", function* () {
			const config = {
				name: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(["name", "John"], config);
			expect(result).toEqual({ name: "John" });
		});

		test.effect("fails if no value provided", function* () {
			const config = {
				name: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(["name"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
		});

		test.effect("fails if key not provided", function* () {
			const config = {
				name: CommandOption.string(),
				other: CommandOption.string(),
			};
			const result = yield* CommandOption.parse(
				["other", "value"],
				config,
			).pipe(Effect.flip);
			expect(result).toBeInstanceOf(CommandOption.Error.MissingOptions);
			expect(result.message).toContain("name");
		});
	});

	describe("withSchema", () => {
		test.effect("parses with valid schema", function* () {
			const config = {
				age: pipe(CommandOption.string(), (_) =>
					CommandOption.withSchema(_, Schema.NumberFromString),
				),
			};
			const result = yield* CommandOption.parse(["age", "25"], config);
			expect(result.age).toBe(25);
		});

		test.effect("fails on invalid schema", function* () {
			const config = {
				age: pipe(CommandOption.string(), (_) =>
					CommandOption.withSchema(_, Schema.NumberFromString),
				),
			};
			const result = yield* CommandOption.parse(
				["age", "notnumber"],
				config,
			).pipe(Effect.flip);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
			expect(result.cause).toBeInstanceOf(ParseError);
		});
	});

	describe("optional", () => {
		test.effect("parses when present", function* () {
			const config = {
				surname: pipe(CommandOption.string(), CommandOption.optional),
			};
			const result = yield* CommandOption.parse(["surname", "Doe"], config);
			expect(result.surname).toEqual(Option.some("Doe"));
		});

		test.effect("defaults to none when absent", function* () {
			const config = {
				surname: pipe(CommandOption.string(), CommandOption.optional),
			};
			const result = yield* CommandOption.parse([], config);
			expect(result.surname).toEqual(Option.none());
		});

		test.effect("fails if provided but invalid", function* () {
			const config = {
				surname: pipe(CommandOption.string(), CommandOption.optional),
			};
			const result = yield* CommandOption.parse(["surname"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
		});
	});

	describe("withDefault", () => {
		test.effect("parses when present", function* () {
			const config = {
				score: pipe(CommandOption.string(), (_) =>
					CommandOption.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandOption.parse(["score", "100"], config);
			expect(result.score).toBe("100");
		});

		test.effect("defaults when absent", function* () {
			const config = {
				score: pipe(CommandOption.string(), (_) =>
					CommandOption.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandOption.parse([], config);
			expect(result.score).toBe("zero");
		});

		test.effect("fails if provided but invalid", function* () {
			const config = {
				score: pipe(CommandOption.string(), (_) =>
					CommandOption.withDefault(_, "zero"),
				),
			};
			const result = yield* CommandOption.parse(["score"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
		});
	});

	describe("filter", () => {
		test.effect("passes when predicate matches", function* () {
			const string = pipe(
				CommandOption.make({
					run: () => Effect.succeed({ value: "string", left: [] }),
				}),
				(_) => CommandOption.filter(_, Predicate.isString),
			);
			const config = { name: string };
			const result = yield* CommandOption.parse(["name"], config);
			expect(result.name).toBe("string");
		});

		test.effect("fails when predicate does not match", function* () {
			const string = pipe(
				CommandOption.make({
					run: () => Effect.succeed({ value: 10, left: [] }),
				}),
				(_) => CommandOption.filter(_, Predicate.isString),
			);
			const config = { name: string };
			const result = yield* CommandOption.parse(["name"], config).pipe(
				Effect.flip,
			);
			expect(result).toBeInstanceOf(CommandOption.Error.InvalidOptionValue);
			expect(result.cause).toBeInstanceOf(Cause.NoSuchElementException);
		});
	});
});
