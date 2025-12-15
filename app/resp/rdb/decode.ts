import * as FileSystem from "@effect/platform/FileSystem";
import * as BigInteger from "effect/BigInt";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { IntegerFromString } from "$/schema/number";
import { concatUint8, concatUint8AsNumber } from "$/utils/buffer";
import { whileLoop } from "$/utils/effect";
import { ENCODING, OpCode } from "./constants";
import { LZF } from "./lzf";
import type { AuxiliaryFields, StringEncoded } from "./type";

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

	const b = yield* decodeMagic(buffer, config?.magic ?? MAGIC).pipe(
		Effect.flatMap((buffer) =>
			decodeVersion(buffer, config?.versionLength ?? VERSION_LENGTH),
		),
		Effect.flatMap(({ rest }) => decodeAuxFields(rest)),
	);

	yield* Effect.log(...HashMap.entries(b.fields));
	yield* Effect.log(b.rest.toString(ENCODING));

	return yield* Effect.void;
});

const decodeMagic = Effect.fnUntraced(function* (
	buffer: Buffer,
	expected: string,
) {
	const received = buffer.toString(ENCODING, 0, expected.length);
	if (received !== expected) {
		return yield* new DecodeError({
			message: `Invalid MAGIC string. Exptected ${expected}. Received ${received}`,
		});
	}

	return buffer.subarray(expected.length);
});

const decodeVersion = Effect.fnUntraced(function* (
	buffer: Buffer,
	length: number,
) {
	const raw = buffer.toString(ENCODING, 0, length);
	const version = yield* Schema.decode(IntegerFromString)(raw).pipe(
		Effect.mapError(
			() => new DecodeError({ message: `Invalid version. Received ${raw}` }),
		),
	);

	return { version, rest: buffer.subarray(length) };
});

const decodeAuxFields = Effect.fnUntraced(function* (buffer: Buffer) {
	const fields: AuxiliaryFields = HashMap.empty().pipe(HashMap.beginMutation);

	const result = yield* whileLoop(
		{ buffer, fields },
		Effect.fnUntraced(function* ({ buffer, fields }) {
			const field = yield* decodeAuxField(buffer);
			return Option.map(field, ({ key, value, rest }) => ({
				fields: HashMap.set(fields, key, value),
				buffer: rest,
			}));
		}),
	);

	return { fields: HashMap.endMutation(result.fields), rest: result.buffer };
});

const decodeAuxField = Effect.fnUntraced(function* (buffer: Buffer) {
	const code = buffer.at(0);
	if (code !== OpCode.AuxiliaryField) {
		return Option.none();
	}

	const key = yield* decodeStringEncoded(buffer.subarray(1));
	const value = yield* decodeStringEncoded(key.rest);

	return Option.some({
		rest: value.rest,
		key: key.value.toString(),
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

const decodeStringEncoded = Effect.fnUntraced(function* (
	buffer: Buffer,
): Effect.fn.Return<DecodeResult<StringEncoded>, DecodeError> {
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
					const value = concatUint8(data.subarray(0, 2));
					const rest = data.subarray(2);
					return { value, rest };
				}
				case SpecialLengthEncodingSubtype.Int32Bit: {
					const data = buffer.subarray(1);
					const value = concatUint8(data.subarray(0, 4));
					const rest = data.subarray(4);
					return { value, rest };
				}
				case SpecialLengthEncodingSubtype.CompressedString: {
					const { value: clen, rest } = yield* decodeStringEncodedInteger(
						buffer.subarray(1),
					);
					const { value: len, rest: rest2 } =
						yield* decodeStringEncodedInteger(rest);
					const raw = rest2.subarray(0, clen);
					const parsed = LZF.decompress(raw);
					if (Option.isNone(parsed)) {
						return yield* new DecodeError({
							message: `Invalid LZF string: ${raw.toString(ENCODING)}`,
						});
					}

					const value = parsed.value;
					if (value.length !== len) {
						return yield* new DecodeError({
							message: `LZF string length doesn't match. Expected ${len}. Received ${value.length} and string: ${value}`,
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

const decodeStringEncodedBigInt = Effect.fnUntraced(function* (buffer: Buffer) {
	const { value, rest } = yield* decodeStringEncoded(buffer);
	if (!Predicate.isBigInt(value)) {
		return yield* new DecodeError({
			message: `Expected an integer value. Received ${value}`,
		});
	}

	const result: DecodeResult<bigint> = { rest, value };
	return result;
});

const decodeStringEncodedInteger = Effect.fnUntraced(function* (
	buffer: Buffer,
) {
	const { value, rest } = yield* decodeStringEncodedBigInt(buffer);
	const parsed = BigInteger.toNumber(value);
	if (Option.isNone(parsed)) {
		return yield* new DecodeError({
			message: `Could not parse received integer: ${value}`,
		});
	}

	const result: DecodeResult<number> = { rest, value: parsed.value };
	return result;
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
	rest: Buffer;
}
