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
		decode(input) {
			return input[1];
		},
		encode(input) {
			return [SimpleStringPrefix, input, CRLF] as const;
		},
	}),
);

export class SimpleError extends Schema.TaggedError<SimpleError>("SimpleError")(
	"SimpleError",
	{ message: Schema.String },
) {}

const decodeSimpleError = ParseResult.decode(SimpleError);
const SimpleErrorPrefix = "-";
export const SimpleErrorFromString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transformOrFail(SimpleError, {
		decode(input) {
			const message = input[1];
			return decodeSimpleError({ _tag: "SimpleError", message });
		},
		encode(input) {
			return Effect.succeed([SimpleErrorPrefix, input.message, CRLF] as const);
		},
	}),
);

export const BulkStringPrefix = "$";
export const BulkString = Schema.TemplateLiteralParser(
	BulkStringPrefix,
	CRLF,
	CRLF,
);
