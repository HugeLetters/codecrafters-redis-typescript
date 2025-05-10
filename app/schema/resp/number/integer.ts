import { IntegerFromString, Integer as Integer_ } from "$/schema/number";
import { CRLF } from "$/schema/resp/constants";
import { LeftoverData, noLeftover } from "$/schema/resp/leftover";
import { ImplicitNumberSign } from "$/schema/string";
import { Log } from "$/schema/utils";
import { Effect, ParseResult, Schema } from "effect";

export const IntegerPrefix = ":";
const LeftoverInteger_ = Schema.TemplateLiteralParser(
	IntegerPrefix,
	ImplicitNumberSign,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverInteger" }));

const IntegerRegex = /^(\d+)\r\n([\s\S]*)$/;
const parseIntFromString = ParseResult.decode(IntegerFromString);
export const LeftoverInteger = LeftoverInteger_.pipe(
	Schema.transformOrFail(LeftoverData(Integer_), {
		decode: Effect.fn(function* (template, _opts, ast) {
			const str = template[2];
			const result = IntegerRegex.exec(str);
			if (result === null) {
				const expected = Log.good(`{integer}${CRLF}{leftover}`);
				const received = Log.bad(str);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const [_match, digits = "", leftover = ""] = result;
			const number = yield* parseIntFromString(digits);
			const sign = template[1] === "+" ? 1 : -1;
			const output = sign * number;
			return { data: output, leftover };
		}),
		encode(input) {
			const integer = input.data;
			type Output = typeof LeftoverInteger_.Type;
			const output: Output = [
				IntegerPrefix,
				integer < 0 ? "-" : "+",
				`${Math.abs(integer)}${CRLF}${input.leftover}`,
			];
			return ParseResult.succeed(output);
		},
		strict: true,
	}),
);

export const Integer = LeftoverInteger.pipe(
	noLeftover((t) => t.leftover, "RespInteger"),
	Schema.transform(Schema.typeSchema(Integer_), {
		decode(template) {
			return template.data;
		},
		encode(integer) {
			return { data: integer, leftover: "" };
		},
	}),
);
