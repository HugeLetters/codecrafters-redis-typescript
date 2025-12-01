import { BigInt as BigInt_, Effect, ParseResult, Schema } from "effect";
import { CRLF } from "$/schema/resp/constants";
import { LeftoverData, noLeftover } from "$/schema/resp/leftover";
import { ImplicitNumberSign } from "$/schema/string";
import { Color } from "$/schema/utils";

export const BigNumberPrefix = "(";
const LeftoverBigNumber_ = Schema.TemplateLiteralParser(
	BigNumberPrefix,
	ImplicitNumberSign,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverBigNumber" }));

const BigIntRegex = /^(\d+)\r\n([\s\S]*)$/;
const parseBigIntFromString = ParseResult.decode(Schema.BigInt);
export const LeftoverBigNumber = LeftoverBigNumber_.pipe(
	Schema.transformOrFail(LeftoverData(Schema.BigIntFromSelf), {
		decode: Effect.fn(function* (template, _opts, ast) {
			const str = template[2];
			const result = BigIntRegex.exec(str);
			if (result === null) {
				const expected = Color.good(`{bigint}${CRLF}{leftover}`);
				const received = Color.bad(str);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const [_match, digits = "", leftover = ""] = result;
			const number = yield* parseBigIntFromString(digits);
			const sign = template[1] === "+" ? 1n : -1n;
			const output = sign * number;
			return { data: output, leftover };
		}),
		encode(input) {
			const integer = input.data;
			type Output = typeof LeftoverBigNumber_.Type;
			const output: Output = [
				BigNumberPrefix,
				integer < 0 ? "-" : "+",
				`${BigInt_.abs(integer)}${CRLF}${input.leftover}`,
			];
			return ParseResult.succeed(output);
		},
		strict: true,
	}),
);

export const BigNumber = LeftoverBigNumber.pipe(
	noLeftover((t) => t.leftover, "BigNumber"),
	Schema.transform(Schema.BigIntFromSelf, {
		decode(template) {
			return template.data;
		},
		encode(bigint) {
			return { data: bigint, leftover: "" };
		},
	}),
);
