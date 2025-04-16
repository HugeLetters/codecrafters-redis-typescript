import { Schema } from "effect";
import { CRLF } from "./constants";

const NullPrefix = "_";
const NullLiteral = `${NullPrefix}${CRLF}`;
// todo - add null string and array
export const Null = Schema.transformLiteral(NullLiteral, null);

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
