import { describe } from "bun:test";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { expectEquivalence, test } from "$/test";
import { decode } from "./decode";
import { encode } from "./encode";
import { Database, RDBFile, type StringEncoded, ValueWithMeta } from "./type";

describe("encode", () => {
	test.effect(
		"encode |> decode gives input back",
		Effect.fn(function* () {
			const input = new RDBFile({
				version: 3n,
				meta: HashMap.fromIterable<string, StringEncoded>([
					["bigint", 123456789n],
					["string", "string"],
					["long-string", "long".repeat(10)],
				]),
				databases: HashMap.fromIterable([
					[
						0n,
						new Database({
							entries: HashMap.fromIterable([
								[
									"key1",
									new ValueWithMeta({
										value: "value1",
										expiry: DateTime.make(new Date("12/12/2012")).pipe(
											Option.getOrThrow,
										),
									}),
								],
								["key2", new ValueWithMeta({ value: 42n, expiry: null })],
							]),
						}),
					],
					[
						1n,
						new Database({
							entries: HashMap.fromIterable([
								["key21", new ValueWithMeta({ value: "value1", expiry: null })],
								["key22", new ValueWithMeta({ value: 42n, expiry: null })],
								["key23", new ValueWithMeta({ value: "value3", expiry: null })],
							]),
						}),
					],
				]),
			});

			const encoded = yield* encode(input);
			const decoded = yield* decode(encoded);

			expectEquivalence(decoded, input);
		}, Effect.provide(BunContext.layer)),
	);
});
