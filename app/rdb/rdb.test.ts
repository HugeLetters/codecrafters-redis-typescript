import { describe } from "bun:test";
import * as Path from "@effect/platform/Path";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import { expectEquivalence, test } from "$/test";
import { decode, decodeFile } from "./decode";
import { encode } from "./encode";
import {
	Database,
	DatabaseMeta,
	RDBFile,
	type StringEncoded,
	ValueWithMeta,
} from "./type";

describe("encode & decode", () => {
	test.effect(
		"with a mock file",
		Effect.fn(function* () {
			const path = yield* Path.Path;
			const file = path.resolve(import.meta.dir, "./mock/base.rdb");
			yield* decodeFile(file);
		}, Effect.provide(BunContext.layer)),
	);

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
							meta: new DatabaseMeta({
								expireHashSize: 128673n,
								hashSize: 3n,
							}),
							entries: HashMap.fromIterable([
								[
									"key1",
									new ValueWithMeta({
										value: "value1",
										expiry: BigInt(new Date("12/12/2012").getTime()),
									}),
								],
								["key2", new ValueWithMeta({ value: 42n, expiry: null })],
							]),
						}),
					],
					[
						1n,
						new Database({
							meta: null,
							entries: HashMap.fromIterable([
								["key21", new ValueWithMeta({ value: "value1", expiry: null })],
								["key22", new ValueWithMeta({ value: 42n, expiry: null })],
							]),
						}),
					],
				]),
			});

			const encoded = yield* encode(input);
			const decoded = yield* decode(encoded);

			expectEquivalence(input, decoded);
		}, Effect.provide(BunContext.layer)),
	);
});
