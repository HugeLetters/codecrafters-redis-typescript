import * as Schema from "effect/Schema";
import { CRLF } from "$/resp/constants";
import { V2 } from "../../v2";

export const NullPrefix = "_";
export const PlainNull = Schema.transformLiteral(
	`${NullPrefix}${CRLF}`,
	null,
).pipe(Schema.annotations({ identifier: "RespNull" }));

export const Null = Schema.Union(PlainNull, V2.Null);

export const LeftoverPlainNull = Schema.TemplateLiteralParser(
	PlainNull,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverRespNull" }));

export const LeftoverNull = Schema.TemplateLiteralParser(
	Null,
	Schema.String,
).pipe(Schema.annotations({ identifier: `Leftover<${Null}>` }));
