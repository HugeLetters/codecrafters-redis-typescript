import * as Schema from "effect/Schema";
import { noLeftover } from "$/resp/utils";
import { LeftoverBulkStringContent } from "./utils";

export const BulkStringPrefix = "$";
export const LeftoverBulkString = Schema.TemplateLiteralParser(
	BulkStringPrefix,
	LeftoverBulkStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverBulkString" }));

export const BulkString = LeftoverBulkString.pipe(
	noLeftover((t) => t[1].leftover, "BulkString"),
	Schema.transform(Schema.String, {
		decode(template) {
			return template[1].data;
		},
		encode(data): typeof LeftoverBulkString.Type {
			return [BulkStringPrefix, { data, leftover: "" }];
		},
	}),
);
