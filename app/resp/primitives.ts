import { Schema } from "effect";
import { CRLF } from "./constants";

const NullPrefix = "_";
const NullLiteral = `${NullPrefix}${CRLF}`;
type NullLiteral = typeof NullLiteral;
// todo - add null string and array
export const Null = Schema.transform(Schema.Literal(NullLiteral), Schema.Null, {
	decode() {
		return null;
	},
	encode(): NullLiteral {
		return NullLiteral;
	},
});

const BooleanPrefix = "#";
const True = "t";
const False = "f";
export const Boolean_ = Schema.TemplateLiteralParser(
	BooleanPrefix,
	Schema.Literal(True, False),
	CRLF,
).pipe(
	Schema.transform(Schema.Boolean, {
		decode(template) {
			const symbol = template[1];
			return symbol === True;
		},
		encode(bool) {
			return [BooleanPrefix, bool ? True : False, CRLF] as const;
		},
	}),
);
