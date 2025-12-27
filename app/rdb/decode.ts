import * as FileSystem from "@effect/platform/FileSystem";
import * as BigInteger from "effect/BigInt";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { crc_64_redis as crc_64 } from "js-crc/models";
import { whileLoop } from "$/utils/effect";
import { concatInteger } from "$/utils/number";
import {
	ENCODING,
	LengthEncodingType,
	MAGIC,
	OpCode,
	SpecialLengthEncodingSubtype,
	ValueType,
	VERSION_LENGTH,
} from "./constants";
import { LZF } from "./lzf";
import {
	type AuxiliaryFields,
	Database,
	type DatabaseEntries,
	DatabaseMeta,
	type Databases,
	type EncodingConfig,
	RDBFile,
	type StringEncoded,
	type Value,
	ValueWithMeta,
} from "./type";

export const decode = Effect.fn("decode")(function* (
	buffer: Buffer,
	config?: EncodingConfig,
) {
	const data = yield* Effect.Do.pipe(
		Effect.bind("version", () =>
			decodeMagic(buffer, config?.magic ?? MAGIC).pipe(
				Effect.flatMap((buffer) =>
					decodeVersion(buffer, config?.versionLength ?? VERSION_LENGTH),
				),
			),
		),
		Effect.bind("aux", ({ version }) => decodeAuxFields(version.rest)),
		Effect.bind("databases", ({ aux }) => decodeDatabases(aux.rest)),
	);

	const isChecksumValid = yield* validateChecksum(buffer, data.databases.rest);
	if (!isChecksumValid) {
		return yield* new DecodeError({
			message: `Checksum didn't match. Received: ${formatBuffer(data.databases.rest)}`,
		});
	}

	return new RDBFile({
		version: data.version.value,
		meta: data.aux.value,
		databases: data.databases.value,
	});
}, Effect.ensureErrorType<DecodeError>());

const decodeMagic = Effect.fn(function* (buffer: Buffer, expected: string) {
	const received = buffer.toString(ENCODING, 0, expected.length);
	if (received !== expected) {
		return yield* new DecodeError({
			message: `Invalid MAGIC string. Exptected ${expected}. Received ${received}`,
		});
	}

	return buffer.subarray(expected.length);
});

const decodeVersion = Effect.fn(function* (buffer: Buffer, length: number) {
	const raw = buffer.toString(ENCODING, 0, length);
	const value = yield* Schema.decode(Schema.BigInt)(raw).pipe(
		Effect.mapError(
			() => new DecodeError({ message: `Invalid version. Received ${raw}` }),
		),
	);

	const result: DecodeResult<bigint> = {
		value,
		rest: buffer.subarray(length),
	};
	return result;
});

const decodeAuxFields = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<AuxiliaryFields> {
	const init: DecodeResult<AuxiliaryFields> = {
		rest: buffer,
		value: HashMap.empty().pipe(HashMap.beginMutation),
	};
	const fields = yield* whileLoop(
		init,
		Effect.fn(function* ({ rest, value: fields }) {
			const code = rest.at(0);
			if (code !== OpCode.AuxiliaryField) {
				return Option.none();
			}

			const key = yield* decodeStringEncodedString(rest.subarray(1));
			const value = yield* decodeStringEncoded(key.rest);
			return Option.some({
				value: HashMap.set(fields, key.value, value.value),
				rest: value.rest,
			});
		}),
	);

	return {
		...fields,
		value: fields.value.pipe(HashMap.endMutation),
	};
});

const decodeLengthBasicLength = Effect.fn(function* (buffer: Buffer) {
	const firstByte = buffer.at(0);
	if (Predicate.isUndefined(firstByte)) {
		return yield* new DecodeError({
			message: "Cannot decode length from an empty buffer",
		});
	}

	const type = firstByte >> 6;
	switch (type) {
		case LengthEncodingType.Bits6: {
			const value = BigInt(firstByte & 0b00111111);
			const rest = buffer.subarray(1);
			return Either.right({ value, rest });
		}

		case LengthEncodingType.Bits14: {
			const secondByte = buffer.at(2);
			if (Predicate.isUndefined(secondByte)) {
				return yield* new DecodeError({
					message: `First byte is ${firstByte} - expected a 2nd byte after`,
				});
			}

			const value = BigInt(firstByte & 0b00111111) + BigInt(secondByte << 6);
			const rest = buffer.subarray(2);
			return Either.right({ value, rest });
		}

		case LengthEncodingType.Bytes4: {
			const value = concatInteger(buffer.subarray(1, 5));
			const rest = buffer.subarray(5);
			return Either.right({ value, rest });
		}

		case LengthEncodingType.Special: {
			return Either.left(type);
		}
	}

	return yield* new DecodeError({
		message: `Unexpected encoding type ${firstByte}`,
	});
}, Effect.ensureSuccessType<
	Either.Either<DecodeResult<bigint>, LengthEncodingType>
>());

const decodeSpecialInteger = Effect.fn(function* (buffer: Buffer) {
	const firstByte = buffer.at(0);
	if (Predicate.isUndefined(firstByte)) {
		return yield* new DecodeError({
			message: "Cannot decode length from an empty buffer",
		});
	}

	const type = firstByte & 0b00111111;
	switch (type) {
		case SpecialLengthEncodingSubtype.Int8Bit: {
			const data = buffer.subarray(1);
			const value = data.at(0);
			if (Predicate.isUndefined(value)) {
				return yield* new DecodeError({
					message: `First byte is ${firstByte} - expected an 8bit integer to follow`,
				});
			}

			const rest = data.subarray(1);
			return Either.right({
				value: BigInteger.fromNumber(value).pipe(Option.getOrElse(() => 0n)),
				rest,
			});
		}
		case SpecialLengthEncodingSubtype.Int16Bit: {
			const data = buffer.subarray(1);
			const value = concatInteger(data.subarray(0, 2).toReversed());
			const rest = data.subarray(2);
			return Either.right({ value, rest });
		}
		case SpecialLengthEncodingSubtype.Int32Bit: {
			const data = buffer.subarray(1);
			const value = concatInteger(data.subarray(0, 4).toReversed());
			const rest = data.subarray(4);
			return Either.right({ value, rest });
		}
		case SpecialLengthEncodingSubtype.CompressedString: {
			return Either.left(type);
		}
	}

	return yield* new DecodeError({
		message: `Unexpected special encoding subtype ${firstByte}`,
	});
}, Effect.ensureSuccessType<
	Either.Either<DecodeResult<bigint>, SpecialLengthEncodingSubtype>
>());

const decodeLengthEncoded = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<bigint> {
	const length = yield* decodeLengthBasicLength(buffer);
	if (Either.isRight(length)) {
		return length.right;
	}

	const type = length.left;
	switch (type) {
		case LengthEncodingType.Special: {
			const special = yield* decodeSpecialInteger(buffer);
			if (Either.isRight(special)) {
				return special.right;
			}

			return yield* new DecodeError({
				message: `Unexpected special encoding subtype ${special.left}`,
			});
		}
	}

	return yield* new DecodeError({
		message: `Unexpected encoding type ${type}`,
	});
});

const decodeLengthEncodedInteger = Effect.fn(function* (buffer: Buffer) {
	const { value, rest } = yield* decodeLengthEncoded(buffer);
	const parsed = BigInteger.toNumber(value);
	if (Option.isNone(parsed)) {
		return yield* new DecodeError({
			message: `Could not parse received integer: ${value}`,
		});
	}

	const result: DecodeResult<number> = { rest, value: parsed.value };
	return result;
});

const decodeStringEncoded = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<StringEncoded> {
	const lengthE = yield* decodeLengthBasicLength(buffer);
	if (Either.isRight(lengthE)) {
		const data = lengthE.right.rest;
		const length = Number(lengthE.right.value);
		const value = data.toString(ENCODING, 0, length);
		const rest = data.subarray(length);
		return { value, rest };
	}

	const type = lengthE.left;
	switch (type) {
		case LengthEncodingType.Special: {
			const special = yield* decodeSpecialInteger(buffer);
			if (Either.isRight(special)) {
				return special.right;
			}

			const subtype = special.left;
			switch (subtype) {
				case SpecialLengthEncodingSubtype.CompressedString: {
					const { value: clen, rest } = yield* decodeLengthEncodedInteger(
						buffer.subarray(1),
					);
					const { value: len, rest: rest2 } =
						yield* decodeLengthEncodedInteger(rest);
					const raw = rest2.subarray(0, clen);
					const parsed = LZF.decompress(raw);
					if (Option.isNone(parsed)) {
						return yield* new DecodeError({
							message: `Invalid LZF string: ${formatBuffer(raw)}`,
						});
					}

					const value = parsed.value;
					if (value.length !== len) {
						return yield* new DecodeError({
							message: `LZF string length doesn't match. Expected ${len}. Received ${value.length} and string: ${formatBuffer(value)}`,
						});
					}

					return { value: value.toString(ENCODING), rest: buffer };
				}
			}

			return yield* new DecodeError({
				message: `Unexpected special encoding subtype ${subtype}`,
			});
		}
	}

	return yield* new DecodeError({
		message: `Unexpected encoding type ${type}`,
	});
});

const decodeStringEncodedString = Effect.fn(function* (buffer: Buffer) {
	const { value, rest } = yield* decodeStringEncoded(buffer);
	if (!Predicate.isString(value)) {
		return yield* new DecodeError({
			message: `Expected a string value. Received: ${value}`,
		});
	}

	const result: DecodeResult<string> = { rest, value };
	return result;
});

const decodeDatabases = Effect.fn(function* (buffer: Buffer) {
	const init: DecodeResult<Databases> = {
		rest: buffer,
		value: HashMap.empty().pipe(HashMap.beginMutation),
	};
	const dbs = yield* whileLoop(
		init,
		Effect.fn(function* ({ rest, value: dbs }) {
			if (rest.at(0) === OpCode.EndOfFile) {
				return Option.none();
			}

			const db = yield* decodeDatabase(rest);
			return Option.some({
				value: HashMap.set(dbs, db.value.selector, db.value.db),
				rest: db.rest,
			});
		}),
	);

	const result: DecodeResult<Databases> = {
		value: dbs.value.pipe(HashMap.endMutation),
		rest: dbs.rest.subarray(1),
	};
	return result;
});

interface DecodedDatabase {
	readonly selector: bigint;
	readonly db: Database;
}
const decodeDatabase = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<DecodedDatabase> {
	const code = buffer.at(0);
	if (code !== OpCode.DatabaseSelector) {
		return yield* new DecodeError({
			message: `Expected Database selector byte ${OpCode.DatabaseSelector}. Received ${code}`,
		});
	}

	const selector = yield* decodeLengthEncoded(buffer.subarray(1));
	const meta = yield* decodeDatabaseMeta(selector.rest);

	const init: DecodeResult<DatabaseEntries> = {
		rest: meta.rest,
		value: HashMap.empty().pipe(HashMap.beginMutation),
	};

	const db = yield* whileLoop(
		init,
		Effect.fn(function* ({ rest, value: db }) {
			if (rest.at(0) === OpCode.DatabaseSelector) {
				return Option.none();
			}

			if (rest.at(0) === OpCode.EndOfFile) {
				return Option.none();
			}

			const entry = yield* decodeDatabaseEntry(rest);
			const { expiry, key, value } = entry.value;
			return Option.some({
				value: HashMap.set(db, key, new ValueWithMeta({ value, expiry })),
				rest: entry.rest,
			});
		}),
	);

	return {
		rest: db.rest,
		value: {
			db: new Database(
				{ entries: db.value.pipe(HashMap.endMutation) },
				meta.value ?? undefined,
			),
			selector: selector.value,
		},
	};
});

const decodeDatabaseMeta = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<DatabaseMeta | null> {
	const code = buffer.at(0);
	if (code !== OpCode.ResizeDB) {
		return { rest: buffer, value: null };
	}

	const hashSize = yield* decodeLengthEncoded(buffer.subarray(1));
	const expireHashSize = yield* decodeLengthEncoded(hashSize.rest);
	return {
		value: new DatabaseMeta({
			hashSize: hashSize.value,
			expireHashSize: expireHashSize.value,
		}),
		rest: expireHashSize.rest,
	};
});

interface DatabaseEntry {
	readonly key: string;
	readonly value: Value;
	readonly expiry: bigint | null;
}
const decodeDatabaseEntry = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<DatabaseEntry> {
	const expiry = decodeDatabaseEntryExpiry(buffer);

	const type = expiry.rest.at(0);
	if (type === undefined) {
		return yield* new DecodeError({
			message: "Expected a value type byte. Received end of buffer",
		});
	}

	const data = expiry.rest.subarray(1);
	const decodeValue = Effect.fn(function* <T extends Value>(
		decoder: (buffer: Buffer) => Effect.Effect<DecodeResult<T>, DecodeError>,
	): DecodeGen<DatabaseEntry> {
		const key = yield* decodeStringEncodedString(data);
		const value = yield* decoder(key.rest);
		return {
			rest: value.rest,
			value: {
				value: value.value,
				key: key.value,
				expiry: expiry.value,
			},
		};
	});

	switch (type) {
		case ValueType.StringEncoded: {
			return yield* decodeValue(decodeStringEncoded);
		}
		case ValueType.List: {
			return yield* new DecodeError({
				message: "List value type is unsupported",
			});
		}
		case ValueType.Set: {
			return yield* new DecodeError({
				message: "Set value type is unsupported",
			});
		}
		case ValueType.SortedSet: {
			return yield* new DecodeError({
				message: "Sorted Set value type is unsupported",
			});
		}
		case ValueType.Hash: {
			return yield* new DecodeError({
				message: "Hash value type is unsupported",
			});
		}
		case ValueType.Zipmap: {
			return yield* new DecodeError({
				message: "ZipMap value type is unsupported",
			});
		}
		case ValueType.Ziplist: {
			return yield* new DecodeError({
				message: "ZipList value type is unsupported",
			});
		}
		case ValueType.Intset: {
			return yield* new DecodeError({
				message: "InetSet value type is unsupported",
			});
		}
		case ValueType.ZipSortedSet: {
			return yield* new DecodeError({
				message: "ZipSortedSet value type is unsupported",
			});
		}
		case ValueType.ZipHashmap: {
			return yield* new DecodeError({
				message: "ZipHashMap value type is unsupported",
			});
		}
		case ValueType.QuickList: {
			return yield* new DecodeError({
				message: "QuickList value type is unsupported",
			});
		}
	}

	return yield* new DecodeError({ message: `Unexpected value type: ${type}` });
});

function decodeDatabaseEntryExpiry(
	buffer: Buffer,
): DecodeResult<bigint | null> {
	const code = buffer.at(0);
	switch (code) {
		case OpCode.ExpireTime: {
			const data = buffer.subarray(1);
			const value = concatInteger(data.subarray(0, 4).toReversed()) * 1000n;
			const rest = data.subarray(4);
			return { value, rest };
		}
		case OpCode.ExpireTimeMs: {
			const data = buffer.subarray(1);
			const value = concatInteger(data.subarray(0, 8).toReversed());
			const rest = data.subarray(8);
			return { value, rest };
		}
	}

	return { rest: buffer, value: null };
}

const validateChecksum = Effect.fn(function* (file: Buffer, checksum: Buffer) {
	if (checksum.length !== 8) {
		return yield* new DecodeError({
			message: `Expected checksum to be of length 8. Received length ${checksum.length} of ${formatBuffer(checksum)}`,
		});
	}

	const checksumValue = concatInteger(checksum.toReversed());
	if (checksumValue === 0n) {
		return true;
	}

	return pipe(
		file.subarray(0, -8),
		crc_64.array,
		concatInteger,
		Equal.equals(checksumValue),
	);
});

export const decodeFile = Effect.fn("decodeFile")(function* (
	path: string,
	config?: EncodingConfig,
) {
	const fs = yield* FileSystem.FileSystem;
	const file = yield* fs.readFile(path);
	const buffer = Buffer.from(file);
	return yield* decode(buffer, config);
});

export class DecodeError extends Data.TaggedError("DecodeError")<{
	readonly message: string;
}> {}

interface DecodeResult<T> {
	readonly value: T;
	readonly rest: Buffer;
}

type DecodeGen<T> = Effect.fn.Return<DecodeResult<T>, DecodeError>;

function formatBuffer(buffer: Buffer) {
	return buffer.join(".");
}
