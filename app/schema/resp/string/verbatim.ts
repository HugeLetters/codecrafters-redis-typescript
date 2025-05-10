import { CRLF } from "$/schema/resp/constants";
import { LeftoverData, noLeftover } from "$/schema/resp/leftover";
import { Log, parseTypeFail } from "$/schema/utils";
import { Effect, Option, ParseResult, Schema, pipe } from "effect";
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
				const expected = Log.good(
					`{length}${CRLF}{XXX}:{content}${CRLF}{leftover}`,
				);
				const received = Log.bad(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseTypeFail(ast, input, message);
			}

			const [_match, length = "", contentChunk = "", leftoverChunk = ""] =
				result;
			const expectedLength = yield* parseIntFromString(length);
			const content = contentChunk.slice(0, expectedLength);
			const actualLength = content.length;

			if (actualLength !== expectedLength) {
				const expected = Log.good(expectedLength);
				const received = Log.bad(content);
				const receivedLength = Log.bad(actualLength);
				const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
				return yield* parseTypeFail(ast, content, message);
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
							const expected = Log.good(expectedLength);

							const extraContent = crlfWithLeftover.slice(
								0,
								actualCrlfPosition,
							);
							const received = Log.bad(content + extraContent);

							const extraLength = actualLength + actualCrlfPosition;
							const receivedLength = Log.bad(extraLength);
							const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
							return yield* parseTypeFail(ast, content, message);
						},
						*onNone() {
							const errorMessage =
								"Could not locate CRLF in a verbatim string - this should never happen";
							yield* Effect.logError(errorMessage);

							const expectedCrlf = Log.good(CRLF);
							const expectedPosition = Log.good(crlfPosition);
							const received = Log.bad(receivedCrlf);
							const message = `Expected to contain ${expectedCrlf} at position ${expectedPosition} - received ${received}`;
							return yield* parseTypeFail(ast, crlfWithLeftover, message);
						},
					}),
				);
			}

			const encoding = content.slice(0, ENCODING_LENGTH);
			const text = content.slice(ENCODING_LENGTH + 1);
			const leftover = crlfWithLeftover.slice(leftoverPosition);
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
