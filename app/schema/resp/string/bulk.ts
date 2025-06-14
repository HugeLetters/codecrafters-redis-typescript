import { CRLF } from "$/schema/resp/constants";
import { Error_ } from "$/schema/resp/error";
import { noLeftover } from "$/schema/resp/leftover";
import { Color } from "$/schema/utils";
import { Logger } from "$/utils/logger";
import { Effect, Option, ParseResult, Schema, pipe } from "effect";
import {
	LeftoverError,
	LeftoverString,
	getCrlfPosition,
	parseIntFromString,
} from "./utils";

const BulkStringRegex = /^(\d+)\r\n([\s\S]*)(\r\n[\s\S]*)$/;
const LeftoverBulkStringContent = Schema.String.pipe(
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

			const [_match, length = "", contentChunk = "", leftoverChunk = ""] =
				result;
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
				return yield* pipe(
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

export const BulkErrorPrefix = "!";
const LeftoverBulkErrorTemplate = Schema.TemplateLiteralParser(
	BulkErrorPrefix,
	LeftoverBulkStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverBulkError" }));

export const LeftoverBulkError = LeftoverBulkErrorTemplate.pipe(
	Schema.transform(LeftoverError, {
		decode(template) {
			const data = template[1];
			const message = data.data;
			const { _tag } = Error_;
			return { data: { _tag, message }, leftover: data.leftover };
		},
		encode(data): typeof LeftoverBulkErrorTemplate.Type {
			return [
				BulkErrorPrefix,
				{ data: data.data.message, leftover: data.leftover },
			];
		},
	}),
);

export const BulkError = LeftoverBulkError.pipe(
	noLeftover((t) => t.leftover, "BulkError"),
	Schema.transform(Schema.typeSchema(Error_), {
		decode(template) {
			return template.data;
		},
		encode(data): typeof LeftoverBulkError.Type {
			return { data, leftover: "" };
		},
	}),
);
