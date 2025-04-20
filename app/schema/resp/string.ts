import { notPattern } from "$/schema/string";
import { green, red } from "$/utils/stdout";
import { Effect, ParseResult, Schema } from "effect";
import { IntegerFromString } from "../number";
import { CRLF } from "./constants";

const CleanString = Schema.String.pipe(notPattern(/[\r\n]/));

const SimpleStringPrefix = "+";
export const SimpleString = Schema.TemplateLiteralParser(
	SimpleStringPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transform(Schema.String, {
		decode(template) {
			return template[1];
		},
		encode(str) {
			return [SimpleStringPrefix, str, CRLF] as const;
		},
	}),
);

export class SimpleError extends Schema.TaggedError<SimpleError>()(
	"SimpleError",
	{
		message: Schema.String,
	},
) {}

const SimpleErrorPrefix = "-";
export const SimpleErrorFromString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transform(SimpleError, {
		decode(template) {
			const message = template[1];
			const { _tag } = SimpleError;
			return { _tag, message };
		},
		encode(err) {
			return [SimpleErrorPrefix, err.message, CRLF] as const;
		},
	}),
);

const BulkStringPrefix = "$";
const BulkStringRegex = /^(\d+)\r\n([\s\S]*)$/;
const parseIntFromString = ParseResult.decode(IntegerFromString);
const BulkStringTemplate = Schema.TemplateLiteralParser(
	BulkStringPrefix,
	Schema.String,
	CRLF,
);
export const BulkString = BulkStringTemplate.pipe(
	Schema.transformOrFail(Schema.String, {
		decode(template, _, ast) {
			return Effect.gen(function* () {
				const input = template[1];
				const result = BulkStringRegex.exec(input);
				if (result === null) {
					return yield* ParseResult.fail(
						new ParseResult.Type(
							ast,
							input,
							`Expected string matching ${green("${integer}\\r\\n${string}")}. Received ${red(JSON.stringify(input))}`,
						),
					);
				}

				const [match, length, string = ""] = result;
				if (length === undefined) {
					return yield* ParseResult.fail(
						new ParseResult.Type(
							ast,
							input,
							`Expected string matching ${green("${integer}")}\\r\\n\${string}. Received ${red(JSON.stringify(match))}`,
						),
					);
				}

				const expectedLength = yield* parseIntFromString(length);
				const actualLength = string.length;
				if (string.length !== expectedLength) {
					return yield* ParseResult.fail(
						new ParseResult.Type(
							ast,
							string,
							`Expected string of length ${green(expectedLength)}. Received ${red(string)} of length ${red(actualLength)}`,
						),
					);
				}

				return string;
			});
		},
		encode(s) {
			type Result = typeof BulkStringTemplate.Type;
			return ParseResult.succeed<Result>([
				BulkStringPrefix,
				`${s.length}${CRLF}${s}`,
				CRLF,
			]);
		},
	}),
);
