import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Str from "effect/String";

export const getInfo = Effect.fn("getInfo")(function* (
	headers: ReadonlyArray<string>,
) {
	const entries = yield* Effect.all(
		headers.map((header) =>
			getHeaderInfo(header).pipe(Effect.map((info) => ({ header, info }))),
		),
		{ concurrency: "unbounded" },
	);

	return pipe(
		Chunk.fromIterable(entries),
		Chunk.flatMap((entry) =>
			Chunk.prepend(
				Chunk.map(entry.info, ([key, value]) => `${key}:${value}`),
				`#${Str.capitalize(entry.header)}`,
			),
		),
		Chunk.join("\n"),
	);
});

type HeaderEntry = [key: string, value: string];
type HeaderEntries = Chunk.Chunk<HeaderEntry>;

const getHeaderInfo = Effect.fn("getHeaderInfo")(function* (header: string) {
	switch (header) {
		case "replication": {
			return yield* getReplicationInfo();
		}
	}

	return Chunk.empty();
}, Effect.ensureSuccessType<HeaderEntries>());

const getReplicationInfo = Effect.fn("getReplicationInfo")(function () {
	return Effect.succeed<HeaderEntries>(Chunk.of(["role", "master"]));
});
