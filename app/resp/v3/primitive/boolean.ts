import * as Schema from "effect/Schema";
import { CRLF } from "$/resp/constants";
import { noLeftover } from "$/resp/utils";

export const BooleanPrefix = "#";
const True = "t";
const False = "f";
export const LeftoverBoolean = Schema.TemplateLiteralParser(
	BooleanPrefix,
	Schema.transformLiterals([True, true], [False, false]),
	CRLF,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverBoolean" }));

export const RespBoolean = LeftoverBoolean.pipe(
	noLeftover((t) => t[3], "RespBoolean"),
	Schema.transform(Schema.Boolean, {
		decode(template) {
			return template[1];
		},
		encode(bool) {
			type Result = typeof LeftoverBoolean.Type;
			const result: Result = [BooleanPrefix, bool, CRLF, ""];
			return result;
		},
	}),
);
