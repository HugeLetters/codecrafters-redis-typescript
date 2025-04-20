import { Schema } from "effect";
import { CRLF } from "./constants";
import { BulkStringPrefix } from "./string";
import { ArrayPrefix } from "./array";

const NullPrefix = "_";
export const Null = Schema.transformLiterals(
	[`${NullPrefix}${CRLF}`, null],
	[`${BulkStringPrefix}-1${CRLF}`, null],
	[`${ArrayPrefix}-1${CRLF}`, null],
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
