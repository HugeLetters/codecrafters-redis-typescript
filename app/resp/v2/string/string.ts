import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { BULK_ENCODING_LENGTH_THRESHOLD } from "$/resp/constants";
import { BulkString } from "./bulk";
import { SimpleString } from "./simple";

const AnyString = Schema.Union(SimpleString, BulkString);
const AnyStringEncoded = AnyString.pipe(Schema.encodedSchema);

const decodeRespString = ParseResult.decode(AnyString);
const encodeSimpleString = ParseResult.encode(SimpleString);
const encodeBulkString = ParseResult.encode(BulkString);

export const RespString = AnyStringEncoded.pipe(
	Schema.transformOrFail(Schema.String, {
		decode(input) {
			return decodeRespString(input);
		},
		encode(input, opts) {
			if (input.length <= BULK_ENCODING_LENGTH_THRESHOLD) {
				return encodeSimpleString(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkString(input, opts)),
				);
			}

			return encodeBulkString(input, opts);
		},
	}),
	Schema.annotations({ identifier: "RespString" }),
);
