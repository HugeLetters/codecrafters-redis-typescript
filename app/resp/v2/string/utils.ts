import { regex } from "arkregex";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import { CRLF } from "$/resp/constants";
import { RespError } from "$/resp/error";
import { LeftoverData, parseIntFromString } from "$/resp/utils";
import { Color } from "$/schema/utils";
import { Logger } from "$/utils/logger";

export const LeftoverString = LeftoverData(Schema.String);
export const LeftoverError = LeftoverData(RespError);

export const getCrlfPosition = Str.indexOf(CRLF);

const BulkStringRegex = regex(
	// TODO master | why keep CRLF inside leftover group? | by Evgenii Perminov at Thu, 04 Dec 2025 01:48:28 GMT
	`^(?<length>\\d+)${CRLF}(?<content>[\\s\\S]*)(?<leftover>${CRLF}[\\s\\S]*)$`,
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

			// TODO master | why not use content and leftover directly? | by Evgenii Perminov at Thu, 04 Dec 2025 01:48:18 GMT
			const {
				length,
				content: contentChunk,
				leftover: leftoverChunk,
			} = result.groups;
			const expectedLength = yield* parseIntFromString(length);
			const content = contentChunk.slice(0, expectedLength);
			const actualLength = content.length;
			if (actualLength !== expectedLength) {
				const expected = Color.good(expectedLength);
				const received = Color.bad(content);
				const receivedLength = Color.bad(actualLength);
				const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
				const issue = new ParseResult.Type(ast, content, message);
				return yield* ParseResult.fail(issue);
			}

			const crlfPosition = expectedLength;
			const afterContent = contentChunk.slice(crlfPosition) + leftoverChunk;
			const leftoverPosition = CRLF.length;
			const receivedCrlf = afterContent.slice(0, leftoverPosition);

			if (receivedCrlf !== CRLF) {
				return yield* Fn.pipe(
					afterContent,
					getCrlfPosition,
					Option.match({
						*onSome(actualCrlfPosition) {
							const expected = Color.good(expectedLength);

							const extraContent = afterContent.slice(0, actualCrlfPosition);
							const received = Color.bad(content + extraContent);

							const extraLength = actualLength + actualCrlfPosition;
							const receivedLength = Color.bad(extraLength);
							const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
							const issue = new ParseResult.Type(ast, content, message);
							return yield* ParseResult.fail(issue);
						},
						*onNone() {
							const errorMessage =
								"Could not locate CRLF in a bulk string - this should never happen";
							yield* Logger.logError(errorMessage);

							const expectedCrlf = Color.good(CRLF);
							const expectedPosition = Color.good(crlfPosition);
							const received = Color.bad(receivedCrlf);
							const message = `Expected to contain ${expectedCrlf} at position ${expectedPosition} - received ${received}`;
							const issue = new ParseResult.Type(ast, afterContent, message);
							return yield* ParseResult.fail(issue);
						},
					}),
				);
			}

			const leftover = afterContent.slice(leftoverPosition);
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
