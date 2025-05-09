import { CRLF } from "$/schema/resp/constants";
import { Error_ } from "$/schema/resp/error";
import { noLeftover } from "$/schema/resp/leftover";
import { Log, parseFail } from "$/schema/utils";
import { Effect, Option, ParseResult, Schema, pipe } from "effect";
import { LeftoverString, getCrlfPosition, parseIntFromString } from "./utils";

const BulkStringRegex = /^(\d+)\r\n([\s\S]*)(\r\n[\s\S]*)$/;
const LeftoverBulkStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const result = BulkStringRegex.exec(input);
			if (result === null) {
				const expected = Log.expected(
					`{length}${CRLF}{content}${CRLF}{leftover}`,
				);
				const received = Log.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const [_match, length = "", contentChunk = "", leftoverChunk = ""] =
				result;
			const expectedLength = yield* parseIntFromString(length);
			const content = contentChunk.slice(0, expectedLength);
			const actualLength = content.length;
			if (actualLength !== expectedLength) {
				const expected = Log.expected(expectedLength);
				const received = Log.received(content);
				const receivedLength = Log.received(actualLength);
				const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
				return yield* parseFail(ast, content, message);
			}

			const crlfPosition = expectedLength;
			const crlfWithLeftover = contentChunk.slice(crlfPosition) + leftoverChunk;
			const leftoverPosition = CRLF.length;
			const receivedCrlf = crlfWithLeftover.slice(0, leftoverPosition);

			if (receivedCrlf !== CRLF) {
				return yield* pipe(
					crlfWithLeftover,
					getCrlfPosition,
					Option.match({
						*onSome(actualCrlfPosition) {
							const expected = Log.expected(expectedLength);

							const extraContent = crlfWithLeftover.slice(
								0,
								actualCrlfPosition,
							);
							const received = Log.received(content + extraContent);

							const extraLength = actualLength + actualCrlfPosition;
							const receivedLength = Log.received(extraLength);
							const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
							return yield* parseFail(ast, content, message);
						},
						*onNone() {
							const errorMessage =
								"Could not locate CRLF in a bulk string - this should never happen";
							yield* Effect.logError(errorMessage);

							const expectedCrlf = Log.expected(CRLF);
							const expectedPosition = Log.expected(crlfPosition);
							const received = Log.received(receivedCrlf);
							const message = `Expected to contain ${expectedCrlf} at position ${expectedPosition} - received ${received}`;
							return yield* parseFail(ast, crlfWithLeftover, message);
						},
					}),
				);
			}

			const leftover = crlfWithLeftover.slice(leftoverPosition);
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
export const LeftoverBulkError = Schema.TemplateLiteralParser(
	BulkErrorPrefix,
	LeftoverBulkStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverBulkError" }));

export const BulkError = LeftoverBulkError.pipe(
	noLeftover((t) => t[1].leftover, "BulkError"),
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1].data;
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(error): typeof LeftoverBulkError.Type {
			const data = error.message;
			return [BulkErrorPrefix, { data, leftover: "" }];
		},
	}),
);
