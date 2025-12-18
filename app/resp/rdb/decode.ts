import * as FileSystem from "@effect/platform/FileSystem";
import * as Arr from "effect/Array";
import * as BigInteger from "effect/BigInt";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { crc_64_redis as crc_64 } from "js-crc/models";
import { whileLoop } from "$/utils/effect";
import { concatInteger, concatUint8AsNumber } from "$/utils/number";
import { ENCODING, OpCode, ValueType } from "./constants";
import { LZF } from "./lzf";
import type {
	AuxiliaryFields,
	Database,
	DatabaseEntries,
	DatabaseMeta,
	Databases,
	RDBFile,
	StringEncoded,
	Value,
} from "./type";

const MAGIC = "REDIS";
const VERSION_LENGTH = 4;

interface DecodeConfig {
	magic?: string;
	versionLength?: number;
}

export const decode = Effect.fn("decode")(function* (
	buffer: Buffer,
	config?: DecodeConfig,
) {
	yield* Effect.log(buffer.toString(ENCODING));

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

	const result: RDBFile = {
		version: data.version.value,
		meta: data.aux.value,
		databases: data.databases.value,
	};

	yield* Effect.log("version", result.version);
	yield* Effect.log("meta", [...HashMap.entries(result.meta)]);
	yield* Effect.log(
		"dbs",
		[...HashMap.entries(result.databases)].map(([selector, db]) => [
			selector,
			db.meta,
			[...HashMap.entries(db.entries)],
		]),
	);
	yield* Effect.log(
		Arr.zip(
			data.databases.rest,
			data.databases.rest.toString(ENCODING).split(""),
		),
	);

	return result;
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

const decodeAuxFields = Effect.fn(function* (buffer: Buffer) {
	const init: DecodeResult<AuxiliaryFields> = {
		rest: buffer,
		value: HashMap.empty().pipe(HashMap.beginMutation),
	};
	return yield* whileLoop(
		init,
		Effect.fn(function* ({ rest, value: fields }) {
			const field = yield* decodeAuxField(rest);
			return Option.map(field, ({ key, value, rest }) => ({
				value: HashMap.set(fields, key, value),
				rest,
			}));
		}),
	);
});

const decodeAuxField = Effect.fn(function* (buffer: Buffer) {
	const code = buffer.at(0);
	if (code !== OpCode.AuxiliaryField) {
		return Option.none();
	}

	const key = yield* decodeStringEncodedString(buffer.subarray(1));
	const value = yield* decodeStringEncoded(key.rest);

	return Option.some({
		rest: value.rest,
		key: key.value,
		value: value.value,
	});
});

enum LengthEncodingType {
	Bits6 = 0b00,
	Bits14 = 0b01,
	Bytes4 = 0b10,
	Special = 0b11,
}

enum SpecialLengthEncodingSubtype {
	Int8Bit = 0,
	Int16Bit = 1,
	Int32Bit = 2,
	CompressedString = 3,
}

// TODO master | dedupe length and string encoded logic | by Evgenii Perminov at Wed, 17 Dec 2025 19:55:39 GMT
const decodeLengthEncoded = Effect.fn(function* (
	buffer: Buffer,
): DecodeGen<bigint> {
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
			return { value, rest };
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
			return { value, rest };
		}

		case LengthEncodingType.Bytes4: {
			const value = concatInteger(buffer.subarray(1, 5));
			const rest = buffer.subarray(5);
			return { value, rest };
		}

		case LengthEncodingType.Special: {
			const subtype = firstByte & 0b00111111;
			switch (subtype) {
				case SpecialLengthEncodingSubtype.Int8Bit: {
					const data = buffer.subarray(1);
					const value = data.at(0);
					if (Predicate.isUndefined(value)) {
						return yield* new DecodeError({
							message: `First byte is ${firstByte} - expected an 8bit integer to follow`,
						});
					}

					const rest = data.subarray(1);
					return pipe(
						value,
						BigInteger.fromNumber,
						Option.getOrElse(() => 0n),
						(value) => ({ value, rest }),
					);
				}
				case SpecialLengthEncodingSubtype.Int16Bit: {
					const data = buffer.subarray(1);
					const value = concatInteger(data.subarray(0, 2));
					const rest = data.subarray(2);
					return { value, rest };
				}
				case SpecialLengthEncodingSubtype.Int32Bit: {
					const data = buffer.subarray(1);
					const value = concatInteger(data.subarray(0, 4));
					const rest = data.subarray(4);
					return { value, rest };
				}
			}

			return yield* new DecodeError({
				message: `Unexpected special encoding subtype ${firstByte}`,
			});
		}
	}

	return yield* new DecodeError({
		message: `Unexpected encoding type ${firstByte}`,
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
	const firstByte = buffer.at(0);
	if (Predicate.isUndefined(firstByte)) {
		return yield* new DecodeError({
			message: "Cannot decode string from en empty buffer",
		});
	}

	const type = firstByte >> 6;
	switch (type) {
		case LengthEncodingType.Bits6: {
			const length = firstByte & 0b00111111;
			const data = buffer.subarray(1);
			const value = data.toString(ENCODING, 0, length);
			const rest = data.subarray(length);
			return { value, rest };
		}

		case LengthEncodingType.Bits14: {
			const secondByte = buffer.at(2);
			if (Predicate.isUndefined(secondByte)) {
				return yield* new DecodeError({
					message: `First byte is ${firstByte} - expected a 2nd byte after`,
				});
			}

			const length = (firstByte & 0b00111111) + (secondByte << 6);
			const data = buffer.subarray(2);
			const value = data.toString(ENCODING, 0, length);
			const rest = data.subarray(length);
			return { value, rest };
		}

		case LengthEncodingType.Bytes4: {
			const length = concatUint8AsNumber(buffer.subarray(1, 5)) ?? 0;
			const data = buffer.subarray(5);
			const value = data.toString(ENCODING, 0, length);
			const rest = data.subarray(length);
			return { value, rest };
		}

		case LengthEncodingType.Special: {
			const subtype = firstByte & 0b00111111;
			switch (subtype) {
				case SpecialLengthEncodingSubtype.Int8Bit: {
					const data = buffer.subarray(1);
					const value = data.at(0);
					if (Predicate.isUndefined(value)) {
						return yield* new DecodeError({
							message: `First byte is ${firstByte} - expected an 8bit integer to follow`,
						});
					}

					const rest = data.subarray(1);
					return {
						value: BigInteger.fromNumber(value).pipe(
							Option.getOrElse(() => 0n),
						),
						rest,
					};
				}
				case SpecialLengthEncodingSubtype.Int16Bit: {
					const data = buffer.subarray(1);
					const value = concatInteger(data.subarray(0, 2));
					const rest = data.subarray(2);
					return { value, rest };
				}
				case SpecialLengthEncodingSubtype.Int32Bit: {
					const data = buffer.subarray(1);
					const value = concatInteger(data.subarray(0, 4));
					const rest = data.subarray(4);
					return { value, rest };
				}
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
				message: `Unexpected special encoding subtype ${firstByte}`,
			});
		}
	}

	return yield* new DecodeError({
		message: `Unexpected encoding type ${firstByte}`,
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
	return yield* whileLoop(
		init,
		Effect.fn(function* ({ rest, value: dbs }) {
			const db = yield* decodeDatabase(rest);
			return Option.map(db, ({ value, rest }) => ({
				value: HashMap.set(dbs, value.selector, value.db),
				rest,
			}));
		}),
	);
});

interface DecodedDatabase {
	readonly selector: bigint;
	readonly db: Database;
}
const decodeDatabase = Effect.fn(function* (buffer: Buffer) {
	const code = buffer.at(0);
	if (code !== OpCode.DatabaseSelector) {
		return Option.none();
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
			if (rest.at(0) === OpCode.EndOfFile) {
				return Option.none();
			}

			const entry = yield* decodeDatabaseEntry(rest);
			const { expiry, key, value } = entry.value;
			return Option.some({
				value: HashMap.set(db, key, { value, expiry }),
				rest: entry.rest,
			});
		}),
	);

	return Option.some<DecodeResult<DecodedDatabase>>({
		rest: db.rest.subarray(1),
		value: {
			db: { entries: db.value, meta: meta.value },
			selector: selector.value,
		},
	});
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
		value: { hashSize: hashSize.value, expireHashSize: expireHashSize.value },
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
			const value = concatInteger(data.subarray(0, 4)) * 1000n;
			const rest = data.subarray(4);
			return { value, rest };
		}
		case OpCode.ExpireTimeMs: {
			const data = buffer.subarray(1);
			const value = concatInteger(data.subarray(0, 8));
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

	const checksumValue = concatInteger(checksum);
	if (checksumValue === 0n) {
		return true;
	}

	return pipe(
		file.subarray(0, -8),
		crc_64.array,
		(_) => _.reverse(),
		concatInteger,
		Equal.equals(checksumValue),
	);
});

export const decodeFile = Effect.fn("decodeFile")(function* (
	path: string,
	config?: DecodeConfig,
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
