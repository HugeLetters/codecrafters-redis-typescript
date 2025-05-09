import { CRLF } from "$/schema/resp/constants";
import { DigitString, ImplicitNumberSign } from "$/schema/string";
import { BigInt as BigInt_, Schema } from "effect";

export const BigNumberPrefix = "(";
export const BigNumber = Schema.TemplateLiteralParser(
	BigNumberPrefix,
	ImplicitNumberSign,
	DigitString.pipe(Schema.compose(Schema.BigInt)),
	CRLF,
).pipe(
	Schema.annotations({ identifier: "BigNumber" }),
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
