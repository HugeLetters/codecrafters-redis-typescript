import { Integer as Integer_, MultiplierFromNumberSign } from "$/schema/number";
import { DigitString, ImplicitNumberSign } from "$/schema/string";
import { Schema } from "effect";
import { CRLF } from "./constants";

const IntegerPrefix = ":";
export const Integer = Schema.TemplateLiteralParser(
	IntegerPrefix,
	ImplicitNumberSign.pipe(Schema.compose(MultiplierFromNumberSign)),
	DigitString.pipe(Schema.parseNumber),
	CRLF,
).pipe(
	Schema.transform(Integer_, {
		decode(template) {
			const number = template[2];
			const sign = template[1];
			return sign * number;
		},
		encode(integer) {
			return [
				IntegerPrefix,
				integer < 0 ? -1 : 1,
				Math.abs(integer),
				CRLF,
			] as const;
		},
	}),
);

export const Double = Schema.Never;
