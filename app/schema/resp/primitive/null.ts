import { CRLF } from "$/schema/resp/constants";
import { Schema } from "effect";

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

export const LeftoverPlainNull = Schema.TemplateLiteralParser(
	PlainNull,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverRespNull" }));

export const LeftoverBulkStringNull = Schema.TemplateLiteralParser(
	BulkStringNull,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverNullBulkString" }));

export const LeftoverArrayNull = Schema.TemplateLiteralParser(
	ArrayNull,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverNullArray" }));

export const LeftoverNull = Schema.TemplateLiteralParser(
	Null,
	Schema.String,
).pipe(Schema.annotations({ identifier: `Leftover<${Null}>` }));
