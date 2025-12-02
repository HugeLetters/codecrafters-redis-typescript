import * as Effect from "effect/Effect";
import { CRLF } from "$/schema/resp/constants";
import { LeftoverData, noLeftover } from "$/schema/resp/leftover";
import { Color } from "$/schema/utils";
import { Logger } from "$/utils/logger";
import "effect/Function";
import * as Fn from "effect/Function";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { getCrlfPosition, parseIntFromString } from "./utils";

export class VerbatimString extends Schema.Class<VerbatimString>(
	"VerbatimString",
)({
	encoding: Schema.String.pipe(Schema.length(3)),
	text: Schema.String,
}) {}

const ENCODING_LENGTH = 3;
const VerbatimStringRegex = /^(\d+)\r\n([\s\S]{3}:[\s\S]*)(\r\n[\s\S]*)$/;
const LeftoverVerbatimStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverData(VerbatimString), {
		decode: Effect.fn(function* (input, _opts, ast) {
			const result = VerbatimStringRegex.exec(input);
			if (result === null) {
				const expected = Color.good(
					`{length}${CRLF}{XXX}:{content}${CRLF}{leftover}`,
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
								"Could not locate CRLF in a verbatim string - this should never happen";
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

			const encoding = content.slice(0, ENCODING_LENGTH);
			const text = content.slice(ENCODING_LENGTH + 1);
			const leftover = afterContent.slice(leftoverPosition);
			type Output = LeftoverData<VerbatimString>;
			const output: Output = { data: { encoding, text }, leftover };
			return output;
		}),
		encode(input) {
			const str = input.data;
			const message = `${str.encoding}:${str.text}`;
			const output = `${message.length}${CRLF}${message}${CRLF}${input.leftover}`;
			return ParseResult.succeed(output);
		},
	}),
);

export const VerbatimStringPrefix = "=";
export const LeftoverVerbatimString = Schema.TemplateLiteralParser(
	VerbatimStringPrefix,
	LeftoverVerbatimStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverVerbatimString" }));

export const VerbatimStringFromString = LeftoverVerbatimString.pipe(
	noLeftover((t) => t[1].leftover, "VerbatimString"),
	Schema.transform(Schema.typeSchema(VerbatimString), {
		decode(template) {
			return template[1].data;
		},
		encode(data): typeof LeftoverVerbatimString.Type {
			return [VerbatimStringPrefix, { data, leftover: "" }];
		},
	}),
);
