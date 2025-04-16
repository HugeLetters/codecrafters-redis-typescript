import { notPattern } from "$/schema/string";
import { Schema } from "effect";
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
			return template[1];
		},
		encode(str) {
			return [SimpleStringPrefix, str, CRLF] as const;
		},
	}),
);

export class SimpleError extends Schema.TaggedError<SimpleError>()(
	"SimpleError",
	{
		message: Schema.String,
	},
) {}

const SimpleErrorPrefix = "-";
export const SimpleErrorFromString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transform(SimpleError, {
		decode(template) {
			const message = template[1];
			const { _tag } = SimpleError;
			return { _tag, message };
		},
		encode(err) {
			return [SimpleErrorPrefix, err.message, CRLF] as const;
		},
	}),
);

export const BulkString = Schema.Never;
