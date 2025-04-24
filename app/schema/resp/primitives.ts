import { Schema } from "effect";
import { CRLF } from "./constants";

export const Null = Schema.transformLiterals(
	[`_${CRLF}`, null],
	[`$-1${CRLF}`, null],
	[`*-1${CRLF}`, null],
);

const BooleanPrefix = "#";
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
