import { Integer as Integer_, NaN_ } from "$/schema/number";
import { DigitString, ImplicitNumberSign } from "$/schema/string";
import { BigInt as BigInt_, Schema, flow } from "effect";
import { CRLF } from "./constants";

const IntegerPrefix = ":";
export const Integer = Schema.TemplateLiteralParser(
	IntegerPrefix,
	ImplicitNumberSign,
	DigitString.pipe(Schema.parseNumber),
	CRLF,
).pipe(
	Schema.transform(Integer_, {
		decode(template) {
			const number = template[2];
			const sign = template[1] === "+" ? 1 : -1;
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

const NanLiteral = "nan";
const NanFromString = Schema.Literal(NanLiteral).pipe(
	Schema.transform(NaN_, {
		decode() {
			return Number.NaN;
		},
		encode(): typeof NanLiteral {
			return NanLiteral;
		},
	}),
);

const InfinityFromString = Schema.transformLiterals(
	["inf", Number.POSITIVE_INFINITY],
	["-inf", Number.NEGATIVE_INFINITY],
);

const DoublePrefix = ",";
export const Double = Schema.TemplateLiteralParser(
	DoublePrefix,
	Schema.Union(
		InfinityFromString,
		NanFromString,
		Schema.String.pipe(
			Schema.pattern(/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/),
			Schema.transform(Schema.Number, {
				decode(s) {
					return Number.parseFloat(s);
				},
				encode(s) {
					const standard = s.toString();
					const exponential = toOptimalExponential(s);
					return exponential.length < standard.length ? exponential : standard;
				},
			}),
			Schema.finite(),
		),
	),
	CRLF,
).pipe(
	Schema.transform(Schema.Number, {
		decode(x) {
			return x[1];
		},
		encode(x) {
			return [DoublePrefix, x, CRLF] as const;
		},
	}),
);

const toOptimalExponential = flow(
	(x: number) => x.toExponential(),
	(x) => {
		const [base, exponent] = x.split("e");
		if (!base || !exponent) {
			return x;
		}

		const [int, fraction = ""] = base.split(".");
		const newExponent = Number.parseInt(exponent) - fraction.length;
		return `${int}${fraction}e${newExponent}`;
	},
);

const BigNumberPrefix = "(";
export const BigNumber = Schema.TemplateLiteralParser(
	BigNumberPrefix,
	ImplicitNumberSign,
	DigitString.pipe(Schema.compose(Schema.BigInt)),
	CRLF,
).pipe(
	Schema.transform(Schema.BigIntFromSelf, {
		decode(template) {
			const biging = template[2];
			const sign = template[1] === "+" ? 1n : -1n;
			return sign * biging;
		},
		encode(bigint) {
			return [
				BigNumberPrefix,
				bigint < 0 ? "-" : "+",
				BigInt_.abs(bigint),
				CRLF,
			] as const;
		},
	}),
);
