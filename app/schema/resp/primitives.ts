import { Schema } from "effect";
import { CRLF } from "./constants";

export const NullPrefix = "_";
const NullLiteral = `${NullPrefix}${CRLF}`;
const StringNullLiteral = `$-1${CRLF}`;
const ArrayNullLiteral = `*-1${CRLF}`;
export const Null = Schema.Literal(
	NullLiteral,
	StringNullLiteral,
	ArrayNullLiteral,
).pipe(
	Schema.transform(Schema.Null, {
		decode() {
			return null;
		},
		encode() {
			return "_\r\n" as const;
		},
	}),
);

export const BooleanPrefix = "#";
const True = "t";
const False = "f";
export const Boolean_ = Schema.TemplateLiteralParser(
	BooleanPrefix,
	Schema.transformLiterals([True, true], [False, false]),
	CRLF,
).pipe(
	Schema.transform(Schema.Boolean, {
		decode(template) {
			return template[1];
		},
		encode(bool) {
			return [BooleanPrefix, bool, CRLF] as const;
		},
	}),
);
