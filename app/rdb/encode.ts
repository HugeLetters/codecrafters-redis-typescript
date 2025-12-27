import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Iterable from "effect/Iterable";
import * as Match from "effect/Match";
import { crc_64_redis as crc_64 } from "js-crc/models";
import {
	LengthEncodingType,
	MAGIC,
	OpCode,
	SpecialLengthEncodingSubtype,
	ValueType,
	VERSION_LENGTH,
} from "./constants";
import { LZF } from "./lzf";
import type {
	AuxiliaryFields,
	Database,
	DatabaseEntries,
	Databases,
	EncodingConfig,
	RDBFile,
	StringEncoded,
	Value,
	ValueWithMeta,
} from "./type";

export const encode = Effect.fn("encode")(function* (
	file: RDBFile,
	config?: EncodingConfig,
) {
	const output = yield* Effect.all(
		{
			version: encodeVersion(
				file.version,
				config?.versionLength ?? VERSION_LENGTH,
			),
			aux: encodeAux(file.meta),
			dbs: encodeDatabases(file.databases),
		},
		{ concurrency: "unbounded" },
	);

	const data = Buffer.concat([
		Buffer.from(config?.magic ?? MAGIC),
		output.version,
		output.aux,
		output.dbs,
		Buffer.from([OpCode.EndOfFile]),
	]);

	const checksum = crc_64.array(data).reverse();

	return Buffer.concat([data, Buffer.from(checksum)]);
}, Effect.ensureErrorType<EncodeError>());

const encodeVersion = Effect.fn(function* (version: bigint, length: number) {
	const formatted = String(version).padStart(length, "0");
	if (formatted.length > length) {
		return yield* new EncodeError({
			message: `Version ${version} exceed specified length ${length}`,
		});
	}

	return Buffer.from(formatted);
});

const encodeAux = Effect.fn(function* (fields: AuxiliaryFields) {
	return yield* pipe(
		fields,
		HashMap.entries,
		Iterable.map(([key, value]) => encodeAuxField(key, value)),
		Effect.allWith({ concurrency: "unbounded" }),
		Effect.map(Buffer.concat),
	);
});

const encodeAuxField = Effect.fn(function* (key: string, value: StringEncoded) {
	const data = yield* Effect.all([
		encodeStringEncoded(key),
		encodeStringEncoded(value),
	]);

	return Buffer.concat([Buffer.from([OpCode.AuxiliaryField]), ...data]);
});

const encodeLength = Effect.fn(function* (value: bigint) {
	if (value < 1n << 6n) {
		const arr = yield* bigintToUint8Array(value, 1n);
		return Buffer.from(arr);
	}

	if (value < 1n << 16n) {
		const buffer = yield* bigintToUint8Array(value, 2n);
		buffer[0] = (buffer[0] ?? 0) + (LengthEncodingType.Bits14 << 6);
		return Buffer.from(buffer);
	}

	if (value < 1n << 32n) {
		const buffer = yield* bigintToUint8Array(value, 4n);
		return Buffer.concat([
			Buffer.from([LengthEncodingType.Bytes4 << 6]),
			buffer,
		]);
	}

	return yield* new EncodeError({ message: `Length ${value} is too large` });
});

const encodeStringEncodedString = Effect.fn(function* (value: string) {
	if (value.length < 50) {
		const length = yield* encodeLength(BigInt(value.length));
		return Buffer.concat([length, Buffer.from(value)]);
	}

	const compressed = LZF.compress(Buffer.from(value));
	if (value.length < compressed.length && value.length < 2 ** 32) {
		const length = yield* encodeLength(BigInt(value.length));
		return Buffer.concat([length, Buffer.from(value)]);
	}

	const clen = yield* encodeLength(BigInt(compressed.length));
	const len = yield* encodeLength(BigInt(value.length));

	const code =
		(LengthEncodingType.Special << 6) +
		SpecialLengthEncodingSubtype.CompressedString;
	return Buffer.concat([Buffer.from([code]), clen, len, compressed]);
});

const encodeStringEncodedInteger = Effect.fn(function* (value: bigint) {
	if (value < 1n << 8n) {
		const code =
			(LengthEncodingType.Special << 6) + SpecialLengthEncodingSubtype.Int8Bit;
		return Buffer.from([code, Number(value)]);
	}

	if (value < 1n << 16n) {
		const buffer = yield* bigintToUint8Array(value, 2n);
		const code =
			(LengthEncodingType.Special << 6) + SpecialLengthEncodingSubtype.Int16Bit;
		return Buffer.concat([Buffer.from([code]), buffer]);
	}

	if (value < 1n << 32n) {
		const buffer = yield* bigintToUint8Array(value, 4n);
		const code =
			(LengthEncodingType.Special << 6) + SpecialLengthEncodingSubtype.Int32Bit;

		return Buffer.concat([Buffer.from([code]), buffer]);
	}

	return yield* new EncodeError({ message: `Integer ${value} is too large` });
});

const encodeStringEncoded = Match.type<StringEncoded>().pipe(
	Match.when(Match.bigint, encodeStringEncodedInteger),
	Match.when(Match.string, encodeStringEncodedString),
	Match.exhaustive,
);

const encodeDatabases = Effect.fn(function* (dbs: Databases) {
	return yield* dbs.pipe(
		HashMap.entries,
		Iterable.map(([selector, db]) =>
			Effect.all([encodeDatabase(db), encodeLength(selector)], {
				concurrency: "unbounded",
			}).pipe(
				Effect.map(([db, selector]) =>
					Buffer.concat([Buffer.from([OpCode.DatabaseSelector]), selector, db]),
				),
			),
		),
		Effect.allWith({ concurrency: "unbounded" }),
		Effect.map(Buffer.concat),
	);
});

const encodeDatabase = Effect.fn(function* (db: Database) {
	const data = yield* Effect.all(
		[
			encodeLength(db.meta.hashSize),
			encodeLength(db.meta.expireHashSize),
			encodeDatabaseEntries(db.entries),
		],
		{ concurrency: "unbounded" },
	);
	return Buffer.concat([Buffer.from([OpCode.ResizeDB]), ...data]);
});

const encodeDatabaseEntries = Effect.fn(function* (entries: DatabaseEntries) {
	return yield* pipe(
		entries,
		HashMap.entries,
		Iterable.map(([key, value]) => encodeDatabaseEntry(key, value)),
		Effect.allWith({ concurrency: "unbounded" }),
		Effect.map(Buffer.concat),
	);
});

const encodeDatabaseEntry = Effect.fn(function* (
	key: string,
	value: ValueWithMeta,
) {
	const result = yield* Effect.all(
		{
			expiry: encodeDatabaseExpiry(value),
			key: encodeStringEncoded(key),
			value: encodeDatabaseValueWithType(value.value),
		},
		{ concurrency: "unbounded" },
	);

	return Buffer.concat([
		result.expiry,
		Buffer.from([result.value.type]),
		result.key,
		result.value.value,
	]);
});

interface EncodedValueWithType {
	readonly type: ValueType;
	readonly value: Buffer;
}

const encodeDatabaseValueWithType = Match.type<Value>().pipe(
	Match.whenOr(Match.string, Match.bigint, (v) =>
		encodeStringEncoded(v).pipe(
			Effect.map(
				(encoded): EncodedValueWithType => ({
					type: ValueType.StringEncoded,
					value: encoded,
				}),
			),
		),
	),
	Match.tagsExhaustive({
		List() {
			return Effect.fail(
				new EncodeError({ message: "List encoding is unsupported" }),
			);
		},
		Hash() {
			return Effect.fail(
				new EncodeError({ message: "List encoding is unsupported" }),
			);
		},
		IntSet() {
			return Effect.fail(
				new EncodeError({ message: "List encoding is unsupported" }),
			);
		},
		Set() {
			return Effect.fail(
				new EncodeError({ message: "List encoding is unsupported" }),
			);
		},
		SortedSet() {
			return Effect.fail(
				new EncodeError({ message: "List encoding is unsupported" }),
			);
		},
	}),
);

const EmptyBuffer = Buffer.alloc(0);
const encodeDatabaseExpiry = Effect.fn(function* (value: ValueWithMeta) {
	if (!value.expiry) {
		return EmptyBuffer;
	}

	if (value.expiry % 1000n === 0n) {
		const expiryS = value.expiry / 1000n;
		if (expiryS < 1n << 4n) {
			const buffer = yield* bigintToUint8Array(expiryS, 4n);
			return Buffer.concat([Buffer.from([OpCode.ExpireTime]), buffer]);
		}
	}

	const buffer = yield* bigintToUint8Array(value.expiry, 8n).pipe(
		Effect.mapError(() => {
			return new EncodeError({
				message: `Expiry value too large: ${value.expiry}`,
			});
		}),
	);
	return Buffer.concat([Buffer.from([OpCode.ExpireTimeMs]), buffer]);
});

const bigintToUint8Array = Effect.fn(function* (value: bigint, size: bigint) {
	if (value >= 1n << (8n * size)) {
		return yield* new EncodeError({
			message: `${value} cannot be fit into ${size}-byte buffer`,
		});
	}

	return pipe(size, Number, Buffer.alloc, (_) =>
		_.map((_, i) =>
			Number((value >> (8n * (size - BigInt(i) - 1n))) & ((1n << 8n) - 1n)),
		),
	);
});
export class EncodeError extends Data.TaggedError("EncodeError")<{
	readonly message: string;
}> {}
