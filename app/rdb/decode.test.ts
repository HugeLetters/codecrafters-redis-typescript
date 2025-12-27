import { describe } from "bun:test";
import * as Path from "@effect/platform/Path";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import { expectEquivalence, test } from "$/test";
import { decodeFile } from "./decode";
import { Database, RDBFile, type StringEncoded, ValueWithMeta } from "./type";

describe("decode", () => {
	test.effect(
		"with a mock file",
		Effect.fn(function* () {
			const path = yield* Path.Path;
			const file = path.resolve(import.meta.dir, "./mock/base.rdb");
			const decoded = yield* decodeFile(file);

			expectEquivalence(
				decoded,
				new RDBFile({
					version: 12n,
					meta: HashMap.fromIterable<string, StringEncoded>([
						["redis-ver", "8.4.0"],
						["used-mem", 887920n],
						["redis-bits", 64n],
						["ctime", 1766016308n],
						["aof-base", 0n],
					]),
					databases: HashMap.fromIterable([
						[
							0n,
							new Database({
								entries: HashMap.fromIterable([
									[
										"key3",
										new ValueWithMeta({
											expiry: null,
											value: "another string",
										}),
									],
									[
										"key5",
										new ValueWithMeta({
											expiry: null,
											value: "persistent value",
										}),
									],
									[
										"key2",
										new ValueWithMeta({
											expiry: 1766016608706n,
											value: "redis value",
										}),
									],
									[
										"key4",
										new ValueWithMeta({
											expiry: 1766016368714n,
											value: "expires soon",
										}),
									],
									[
										"key1",
										new ValueWithMeta({
											expiry: null,
											value: "hello world",
										}),
									],
								]),
							}),
						],
					]),
				}),
			);
		}, Effect.provide(BunContext.layer)),
	);
});
