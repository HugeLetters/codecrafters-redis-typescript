import { notPattern } from "$/schema/string/filter";
import { Effect, ParseResult, Schema } from "effect";
import { CRLF } from "./constants";

const CleanString = Schema.String.pipe(notPattern(/[\r\n]/));

const SimpleStringPrefix = "+";
export const SimpleString = Schema.TemplateLiteralParser(
	SimpleStringPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transform(Schema.String, {
		decode(template) {
			const str = template[1];
			return str;
		},
		encode(str) {
			return [SimpleStringPrefix, str, CRLF] as const;
		},
	}),
);

const SimpleErrorTag = "SimpleError";
const SimpleTaggedError = Schema.TaggedError<SimpleError>(SimpleErrorTag);
export class SimpleError extends SimpleTaggedError(SimpleErrorTag, {
	message: Schema.String,
}) {}

const decodeSimpleError = ParseResult.decode(SimpleError);
const SimpleErrorPrefix = "-";
export const SimpleErrorFromString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transformOrFail(SimpleError, {
		decode(template) {
			const message = template[1];
			return decodeSimpleError({ _tag: SimpleErrorTag, message });
		},
		encode(err) {
			return Effect.succeed([SimpleErrorPrefix, err.message, CRLF] as const);
		},
	}),
);

export const BulkString = Schema.Never;
