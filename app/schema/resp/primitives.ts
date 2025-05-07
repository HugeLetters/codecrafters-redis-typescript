import { Schema } from "effect";
import { CRLF } from "./constants";

export const NullPrefix = "_";
export const PlainNull = Schema.transformLiteral(
	`${NullPrefix}${CRLF}`,
	null,
).pipe(Schema.annotations({ identifier: "RespNull" }));
export const BulkStringNull = Schema.transformLiteral(`$-1${CRLF}`, null).pipe(
	Schema.annotations({ identifier: "NullBulkString" }),
);
export const ArrayNull = Schema.transformLiteral(`*-1${CRLF}`, null).pipe(
	Schema.annotations({ identifier: "NullArray" }),
);
export const Null = Schema.Union(PlainNull, BulkStringNull, ArrayNull);

export const BooleanPrefix = "#";
const True = "t";
const False = "f";
export const Boolean_ = Schema.TemplateLiteralParser(
	BooleanPrefix,
	Schema.transformLiterals([True, true], [False, false]),
	CRLF,
).pipe(
	Schema.annotations({ identifier: "RespBoolean" }),
	Schema.transform(Schema.Boolean, {
		decode(template) {
			return template[1];
		},
		encode(bool) {
			return [BooleanPrefix, bool, CRLF] as const;
		},
	}),
);
