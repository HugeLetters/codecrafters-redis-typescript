import { Schema } from "effect";
import { CRLF } from "./constants";

export const Null = Schema.transformLiterals(
	[`_${CRLF}`, null],
	[`$-1${CRLF}`, null],
	[`*-1${CRLF}`, null],
);

const BooleanPrefix = "#";
const True = "t";
const False = "f";
const BooleanFromLiteral = Schema.transformLiterals(
	[True, true],
	[False, false],
);
export const Boolean_ = Schema.TemplateLiteralParser(
	BooleanPrefix,
	Schema.Literal(True, False),
	CRLF,
).pipe(
	Schema.transform(BooleanFromLiteral, {
		decode(template) {
			return template[1];
		},
		encode(bool) {
			return [BooleanPrefix, bool, CRLF] as const;
		},
	}),
);
