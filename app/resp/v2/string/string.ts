import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { RespConfig } from "$/resp/constants";
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
		encode: Effect.fn(function* (input, opts) {
			const { shouldTrySimpleStringEncode } = yield* RespConfig;

			if (shouldTrySimpleStringEncode(input, "string")) {
				return yield* encodeSimpleString(input, opts).pipe(
					ParseResult.orElse(() => encodeBulkString(input, opts)),
				);
			}

			return yield* encodeBulkString(input, opts);
		}),
	}),
	Schema.annotations({ identifier: "RespString" }),
);
