import { Error_ } from "$/schema/resp/error";
import { ParseResult, Schema } from "effect";
import { BulkError, BulkString } from "./bulk";
import { SimpleError, SimpleString } from "./simple";

const RespString = Schema.Union(SimpleString, BulkString);
const RespStringEncoded = RespString.pipe(Schema.encodedSchema);

const decodeRespString = ParseResult.decode(RespString);
const encodeSimpleString = ParseResult.encode(SimpleString);
const encodeBulkString = ParseResult.encode(BulkString);

export const String_ = RespStringEncoded.pipe(
	Schema.transformOrFail(Schema.String, {
		decode(input) {
			return decodeRespString(input);
		},
		encode(input, opts) {
			if (input.length < 10) {
				return encodeSimpleString(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkString(input, opts)),
				);
			}

			return encodeBulkString(input, opts);
		},
	}),
	Schema.annotations({ identifier: "RespString" }),
);

const RespError = Schema.Union(SimpleError, BulkError);
const RespErrorEncoded = RespError.pipe(Schema.encodedSchema);

const decodeRespError = ParseResult.decode(RespError);
const encodeSimpleError = ParseResult.encode(SimpleError);
const encodeBulkError = ParseResult.encode(BulkError);

export const ErrorFromString = RespErrorEncoded.pipe(
	Schema.transformOrFail(Schema.typeSchema(Error_), {
		decode(input) {
			return decodeRespError(input);
		},
		encode(input, opts, _ast) {
			if (input.message.length < 10) {
				return encodeSimpleError(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkError(input, opts)),
				);
			}

			return encodeBulkError(input, opts);
		},
	}),
	Schema.annotations({ identifier: "RespErrorFromString" }),
);
