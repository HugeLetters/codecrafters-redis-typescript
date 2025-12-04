import * as Schema from "effect/Schema";
import { ArrayPrefix, CRLF } from "$/resp/constants";
import { Str } from "./string";

export const BulkStringNull = Schema.transformLiteral(
	`${Str.BulkStringPrefix}-1${CRLF}`,
	null,
).pipe(Schema.annotations({ identifier: "NullBulkString" }));

export const ArrayNull = Schema.transformLiteral(
	`${ArrayPrefix}-1${CRLF}`,
	null,
).pipe(Schema.annotations({ identifier: "NullArray" }));

export const Null = Schema.Union(BulkStringNull, ArrayNull);

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
