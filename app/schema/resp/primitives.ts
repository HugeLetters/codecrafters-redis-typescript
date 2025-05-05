import { Schema } from "effect";
import { CRLF } from "./constants";

export const NullPrefix = "_";
export const PlainNull = Schema.transformLiteral(`${NullPrefix}${CRLF}`, null);
export const BulkStringNull = Schema.transformLiteral(`$-1${CRLF}`, null);
export const ArrayNull = Schema.transformLiteral(`*-1${CRLF}`, null);
export const Null = Schema.Union(PlainNull, BulkStringNull, ArrayNull);

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
