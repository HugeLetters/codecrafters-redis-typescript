import { Schema } from "effect";
import { DigitString } from "./string";

export const Integer = Schema.Int.pipe(Schema.brand("INT"));

export const IntegerFromString = Schema.NumberFromString.pipe(
	Schema.compose(Integer),
);

export const Fraction = Schema.Number.pipe(
	Schema.greaterThanOrEqualTo(0),
	Schema.lessThan(1),
	Schema.brand("Fraction"),
);

export const FractionFromDigitString = DigitString.pipe(
	Schema.transform(Schema.NumberFromString, {
		decode(x) {
			return `0.${x}`;
		},
		encode(x) {
			return x.slice(2);
		},
		strict: false,
	}),
	Schema.compose(Fraction),
);
