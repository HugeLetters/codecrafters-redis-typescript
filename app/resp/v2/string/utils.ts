import { regex } from "arkregex";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import { CRLF } from "$/resp/constants";
import { RespError } from "$/resp/error";
import { LeftoverData, parseIntFromString, RegexUtils } from "$/resp/utils";
import { Color } from "$/schema/utils";

export const LeftoverString = LeftoverData(Schema.String);
export const LeftoverError = LeftoverData(RespError);

export const getCrlfPosition = Str.indexOf(CRLF);

const BulkStringRegex = regex(
	`^(?<length>${RegexUtils.Digit}+)${CRLF}(?<data>.*${CRLF}.*)$`,
	"s",
);
export const LeftoverBulkStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const result = BulkStringRegex.exec(input);
			if (result === null) {
				const expected = Color.good(
					`{length}${CRLF}{content}${CRLF}{leftover}`,
				);
				const received = Color.bad(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				const issue = new ParseResult.Type(ast, input, message);
				return yield* ParseResult.fail(issue);
			}

			const { length, data } = result.groups;
			const expectedLength = yield* parseIntFromString(length);
			const actualLength = data.length;
			if (actualLength < expectedLength) {
				const expected = Color.good(expectedLength);
				const received = Color.bad(data);
				const receivedLength = Color.bad(actualLength);
				const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
				const issue = new ParseResult.Type(ast, data, message);
				return yield* ParseResult.fail(issue);
			}

			const content = data.slice(0, expectedLength);
			const crlfPosition = expectedLength + CRLF.length;
			const crlf = data.slice(expectedLength, crlfPosition);
			const leftover = data.slice(crlfPosition);

			if (crlf !== CRLF) {
				const expectedCrlf = Color.good(CRLF);
				const expectedPosition = Color.good(expectedLength);
				const received = Color.bad(crlf || "<empty string>");
				const message = `Expected to contain ${expectedCrlf} at position ${expectedPosition} - received ${received}`;
				const issue = new ParseResult.Type(ast, crlf, message);
				return yield* ParseResult.fail(issue);
			}

			type Output = typeof LeftoverString.Type;
			const output: Output = { data: content, leftover };
			return output;
		}),
		encode(input) {
			const content = input.data;
			return ParseResult.succeed(
				`${content.length}${CRLF}${content}${CRLF}${input.leftover}`,
			);
		},
	}),
	Schema.annotations({ identifier: "LeftoverBulkStringContent" }),
);
