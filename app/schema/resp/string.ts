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

export class Error_ extends Schema.TaggedError<Error_>()("RespError", {
	message: Schema.String,
}) {}

const SimpleErrorPrefix = "-";
export const ErrorFromSimpleString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	CleanString,
	CRLF,
).pipe(
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1];
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(err) {
			return [SimpleErrorPrefix, err.message, CRLF] as const;
		},
	}),
);

const BulkStringRegex = /^(\d+)\r\n([\s\S]*)$/;
const parseIntFromString = ParseResult.decode(IntegerFromString);
const BulkStringBase = Schema.transformOrFail(Schema.String, Schema.String, {
	decode(input, _, ast) {
		return Effect.gen(function* () {
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
						`Expected string of length ${green(expectedLength)}. Received ${red(JSON.stringify(string))} of length ${red(actualLength)}`,
					),
				);
			}

			return string;
		});
	},
	encode(s) {
		return ParseResult.succeed(`${s.length}${CRLF}${s}`);
	},
});

export const BulkStringPrefix = "$";
const BulkStringTemplate = Schema.TemplateLiteralParser(
	BulkStringPrefix,
	Schema.String,
	CRLF,
);
export const BulkString = BulkStringTemplate.pipe(
	Schema.transform(BulkStringBase, {
		decode(template) {
			return template[1];
		},
		encode(s) {
			type Result = typeof BulkStringTemplate.Type;
			const result: Result = [BulkStringPrefix, s, CRLF];
			return result;
		},
	}),
);

const BulkErrorPrefix = "!";
const BulkErrorTemplate = Schema.TemplateLiteralParser(
	BulkErrorPrefix,
	Schema.String.pipe(Schema.compose(BulkStringBase)),
	CRLF,
);
export const ErrorFromBulkString = BulkErrorTemplate.pipe(
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1];
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(error) {
			type Result = typeof BulkErrorTemplate.Type;
			const result: Result = [BulkErrorPrefix, error.message, CRLF];
			return result;
		},
	}),
);
