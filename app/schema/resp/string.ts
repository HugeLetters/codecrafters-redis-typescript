import { IntegerFromString } from "$/schema/number";
import { notPattern } from "$/schema/string";
import { ParseFailLog, parseFail } from "$/schema/utils";
import { Effect, ParseResult, Schema } from "effect";
import { CRLF } from "./constants";

const CleanString = Schema.String.pipe(notPattern(/[\r\n]/));

export const SimpleStringPrefix = "+";
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

export const SimpleErrorPrefix = "-";
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
				const expected = ParseFailLog.expected("${integer}\r\n${string}");
				const received = ParseFailLog.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const [match, length, string = ""] = result;
			if (length === undefined) {
				const expected = ParseFailLog.expected("${integer}");
				const received = ParseFailLog.received(match);
				const message = `Expected string to contain length: ${expected}\\r\\n\${string}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const expectedLength = yield* parseIntFromString(length);
			const actualLength = string.length;
			if (string.length !== expectedLength) {
				const expected = ParseFailLog.expected(expectedLength);
				const received = ParseFailLog.received(string);
				const receivedLength = ParseFailLog.received(actualLength);
				const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
				return yield* parseFail(ast, string, message);
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

export const String_ = Schema.declare(
	[SimpleString, BulkString],
	{
		decode(simple, bulk) {
			const decode = ParseResult.decodeUnknown(Schema.Union(simple, bulk));
			return function (input, opts) {
				return decode(input, opts);
			};
		},
		encode(simple, bulk) {
			const encodeSimple = ParseResult.encode(simple);
			const encodeBulk = ParseResult.encode(bulk);
			return Effect.fn(function* (input, opts) {
				const str = yield* ParseResult.decodeUnknown(Schema.String)(input);
				if (str.length < 10) {
					return yield* encodeSimple(str, opts);
				}

				return yield* encodeBulk(str, opts);
			});
		},
	},
	{ description: "RESP String" },
);

export const BulkErrorPrefix = "!";
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

export const ErrorFromString = Schema.declare(
	[ErrorFromSimpleString, ErrorFromBulkString],
	{
		decode(simple, bulk) {
			const decode = ParseResult.decodeUnknown(Schema.Union(simple, bulk));
			return function (input, opts) {
				return decode(input, opts);
			};
		},
		encode(simple, bulk) {
			const encodeSimple = ParseResult.encode(simple);
			const encodeBulk = ParseResult.encode(bulk);
			return Effect.fn(function* (input, opts) {
				const str = yield* ParseResult.decodeUnknown(Error_)(input);
				if (str.message.length < 10) {
					return yield* encodeSimple(str, opts);
				}

				return yield* encodeBulk(str, opts);
			});
		},
	},
	{ description: "RESP StringError" },
);

export class VerbatimString extends Schema.Class<VerbatimString>(
	"VerbatimString",
)({
	encoding: Schema.String.pipe(Schema.length(3)),
	text: Schema.String,
}) {}

const VerbatimStringRegex = /^(\d+)\r\n([\s\S]{3}):([\s\S]*)$/;
export const VerbatimStringPrefix = "=";
const VerbatimStringTemplate = Schema.TemplateLiteralParser(
	VerbatimStringPrefix,
	Schema.String,
	CRLF,
);
export const VerbatimStringFromString = VerbatimStringTemplate.pipe(
	Schema.transformOrFail(VerbatimString, {
		decode(template, _, ast) {
			const input = template[1];
			return Effect.gen(function* () {
				const result = VerbatimStringRegex.exec(input);
				if (result === null) {
					const expected = ParseFailLog.expected(
						"${length:int}\r\n${encoding:3}:${string}",
					);
					const received = ParseFailLog.received(input);
					const message = `Expected string matching: ${expected}. Received ${received}`;
					return yield* parseFail(ast, input, message);
				}

				const [match, length, encoding, text = ""] = result;
				if (length === undefined) {
					const expected = `${ParseFailLog.expected("${length:int}")}\\r\\n\${encoding:3}:\${string}`;
					const received = ParseFailLog.received(match);
					const message = `Expected string to contain length: ${expected}. Received ${received}`;
					return yield* parseFail(ast, input, message);
				}

				if (encoding === undefined) {
					const expected = `\${length:int}\\r\\n${ParseFailLog.expected("${encoding:3}")}:\${string}`;
					const received = ParseFailLog.received(match);
					const message = `Expected string to contain encoding: ${expected}. Received ${received}`;
					return yield* parseFail(ast, input, message);
				}

				const expectedLength = yield* parseIntFromString(length);
				const actualLength = encoding.length + 1 + text.length; // +1 for ":"
				if (actualLength !== expectedLength) {
					const expected = ParseFailLog.expected(expectedLength);
					const received = ParseFailLog.received(text);
					const receivedLength = ParseFailLog.received(actualLength);
					const message = `Expected string of length ${expected}. Received ${received} of length ${receivedLength}`;
					return yield* parseFail(ast, text, message);
				}

				return { encoding, text };
			});
		},
		encode(str) {
			const message = `${str.encoding}:${str.text}`;
			const data = `${message.length}${CRLF}${message}`;
			type Result = typeof VerbatimStringTemplate.Type;
			const result: Result = [VerbatimStringPrefix, data, CRLF];
			return ParseResult.succeed(result);
		},
	}),
);
