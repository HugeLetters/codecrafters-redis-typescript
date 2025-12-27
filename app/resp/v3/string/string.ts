import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { BULK_ENCODING_LENGTH_THRESHOLD } from "$/resp/constants";
import { RespError } from "$/resp/error";
import { V2 } from "$/resp/v2";
import { BulkError } from "./bulk";

const AnyError = Schema.Union(V2.String.SimpleError, BulkError);
const AnyErrorEncoded = AnyError.pipe(Schema.encodedSchema);

const decodeRespError = ParseResult.decode(AnyError);
const encodeSimpleError = ParseResult.encode(V2.String.SimpleError);
const encodeBulkError = ParseResult.encode(BulkError);

export const RespErrorFromString = AnyErrorEncoded.pipe(
	Schema.transformOrFail(Schema.typeSchema(RespError), {
		decode(input) {
			return decodeRespError(input);
		},
		encode(input, opts, _ast) {
			if (input.message.length <= BULK_ENCODING_LENGTH_THRESHOLD) {
				return encodeSimpleError(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkError(input, opts)),
				);
			}

			return encodeBulkError(input, opts);
		},
	}),
	Schema.annotations({ identifier: "RespErrorFromString" }),
);
