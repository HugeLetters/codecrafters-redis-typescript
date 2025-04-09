import { Integer as IntegerSchema } from "$/schema/number";
import { Schema } from "effect";
import { CRLF } from "./constants";

const IntegerPrefix = ":";
const NumberSign = Schema.Literal("+", "-");
const ImplicitNumberSign = Schema.transform(
	Schema.Literal(...NumberSign.literals, ""),
	NumberSign,
	{
		decode(optionalSign) {
			return optionalSign === "-" ? "-" : "+";
		},
		encode(sign) {
			return sign === "+" ? "" : "-";
		},
	},
);

const DigitString = Schema.String.pipe(Schema.pattern(/^\d+$/));
export const Integer = Schema.TemplateLiteralParser(
	IntegerPrefix,
	ImplicitNumberSign,
	DigitString.pipe(Schema.parseNumber),
	CRLF,
).pipe(
	Schema.transform(IntegerSchema, {
		decode(template) {
			const number = template[2];
			const sign = template[1] === "-" ? -1 : 1;
			return sign * number;
		},
		encode(integer) {
			return [
				IntegerPrefix,
				integer < 0 ? "-" : "+",
				Math.abs(integer),
				CRLF,
			] as const;
		},
	}),
);

export const Double = Schema.Never;
