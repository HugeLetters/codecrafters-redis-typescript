import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { RespConfig } from "$/resp/constants";
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
		encode: Effect.fn(function* (input, opts) {
			const { shouldTrySimpleStringEncode } = yield* RespConfig;

			if (shouldTrySimpleStringEncode(input.message, "string")) {
				return yield* encodeSimpleError(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkError(input, opts)),
				);
			}

			return yield* encodeBulkError(input, opts);
		}),
	}),
	Schema.annotations({ identifier: "RespErrorFromString" }),
);
