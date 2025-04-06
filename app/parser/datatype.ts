import { notPattern } from "$/schema/string/filter";
import { Schema } from "effect";

const CR = "\r";
const LF = "\n";
const CRLF = `${CR}${LF}`;

const SimpleStringPrefix = "+";
export const SimpleString = Schema.TemplateLiteralParser(
	SimpleStringPrefix,
	Schema.String.pipe(notPattern(/[\r\n]/)),
	CRLF,
).pipe(
	Schema.transform(Schema.String, {
		decode(input) {
			return input[1];
		},
		encode(input) {
			return [SimpleStringPrefix, input, CRLF] as const;
		},
		strict: true,
	}),
);

const SimpleErrorPrefix = "-";
export const SimpleError = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	Schema.String.pipe(notPattern(/[\r\n]/)),
	CRLF,
).pipe(
	Schema.transform(Schema.String, {
		decode(input) {
			return input[1];
		},
		encode(input) {
			return [SimpleErrorPrefix, input, CRLF] as const;
		},
		strict: true,
	}),
);

const IntegerPrefix = ":";
export const Integer = Schema.TemplateLiteralParser(
	IntegerPrefix,
	Schema.Literal("+", "-", ""),
	Schema.String.pipe(Schema.pattern(/^\d+$/), Schema.parseNumber, Schema.int()),
	CRLF,
).pipe(
	Schema.transform(Schema.Number, {
		decode(input) {
			const number = input[2];
			const sign = input[1] === "-" ? -1 : 1;
			return sign * number;
		},
		encode(input) {
			return [
				IntegerPrefix,
				input < 0 ? "-" : "",
				Math.abs(input),
				CRLF,
			] as const;
		},
		strict: true,
	}),
);
