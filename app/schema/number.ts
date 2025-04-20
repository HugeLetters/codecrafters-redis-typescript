import { BigDecimal, Schema } from "effect";
import { DigitString, ImplicitNumberSign, MinusSign, PlusSign } from "./string";

export const Integer = Schema.Int.pipe(Schema.brand("INT"));

export const IntegerFromString = Schema.NumberFromString.pipe(
	Schema.compose(Integer),
);

export const Fraction = Schema.BigDecimalFromSelf.pipe(
	Schema.greaterThanOrEqualToBigDecimal(BigDecimal.fromBigInt(0n)),
	Schema.lessThanBigDecimal(BigDecimal.fromBigInt(1n)),
	Schema.brand("Fraction"),
);

export const FractionFromDigitString = DigitString.pipe(
	Schema.transform(Schema.BigDecimal, {
		decode(digits) {
			return `0.${digits}`;
		},
		encode(_, dec) {
			const significant = dec.value.toString();
			const zeroesCount = dec.scale - significant.length;
			const leading = "0".repeat(Math.max(0, zeroesCount));
			return `${leading}${significant}`;
		},
		strict: false,
	}),
	Schema.compose(Fraction),
);

export const MultiplierFromNumberSign = Schema.transformLiterals(
	[PlusSign, 1],
	[MinusSign, -1],
);

export const MultiplierFromImplicitNumberSign = ImplicitNumberSign.pipe(
	Schema.compose(MultiplierFromNumberSign),
);

export const NaN_ = Schema.declare(
	(value): value is number => Number.isNaN(value),
	{ identifier: "NaN" },
).pipe(Schema.brand("NaN"));
