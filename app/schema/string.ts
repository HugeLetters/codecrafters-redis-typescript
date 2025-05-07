import { Schema } from "effect";

export function notIncludes<I extends string, A, R>(search: string) {
	const formatted = JSON.stringify(search);
	return Schema.filter<Schema.Schema<I, A, R>>(
		(value) => {
			return !value.includes(search);
		},
		{
			title: `not includes(${formatted})`,
			description: `a string not including ${formatted}`,
		},
	);
}

export function notPattern<I extends string, A, R>(regex: RegExp) {
	const source = regex.source;
	return Schema.filter<Schema.Schema<I, A, R>>(
		(value) => {
			regex.lastIndex = 0;
			return !regex.test(value);
		},
		{
			description: `a string not matching the pattern ${source}`,
		},
	);
}

export const DigitString = Schema.String.pipe(
	Schema.pattern(/^\d+$/),
	Schema.brand("DigitString"),
	Schema.annotations({ identifier: "DigitString" }),
);

export const PlusSign = "+";
export const MinusSign = "-";
export const NumberSign = Schema.Literal(PlusSign, MinusSign);
export const ImplicitNumberSign = Schema.Literal(
	...NumberSign.literals,
	"",
).pipe(
	Schema.transform(NumberSign, {
		decode(optionalSign) {
			return optionalSign === MinusSign ? MinusSign : PlusSign;
		},
		encode(sign) {
			return sign === PlusSign ? "" : MinusSign;
		},
	}),
	Schema.annotations({ identifier: "(+-)?" }),
);
