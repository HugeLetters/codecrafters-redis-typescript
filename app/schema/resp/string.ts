import { IntegerFromString } from "$/schema/number";
import { notPattern } from "$/schema/string";
import { Log, parseFail } from "$/schema/utils";
import {
	Effect,
	Option,
	ParseResult,
	Schema,
	String as Str,
	pipe,
} from "effect";
import { CR, CRLF, LF } from "./constants";
import { LeftoverData, noLeftover } from "./leftover";

const CleanString = Schema.String.pipe(
	notPattern(/[\r\n]/),
	Schema.annotations({
		identifier: `string w/o ${Log.received(CR)} or ${Log.received(LF)}`,
	}),
);
const validateCleanString = ParseResult.validate(CleanString);
const LeftoverString = LeftoverData(Schema.String);

const SimpleStringRegex = /^([\s\S]*?)\r\n([\s\S]*)$/;
const LeftoverSimpleStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const match = SimpleStringRegex.exec(input);
			if (!match) {
				const expected = Log.expected(`{content}${CRLF}{leftover}`);
				const received = Log.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const [_match, content = "", leftover = ""] = match;
			const data = yield* validateCleanString(content);
			return { data, leftover };
		}),
		encode(data) {
			return ParseResult.succeed(`${data.data}${CRLF}${data.leftover}`);
		},
	}),
);

export const SimpleStringPrefix = "+";
export const LeftoverSimpleString = Schema.TemplateLiteralParser(
	SimpleStringPrefix,
	LeftoverSimpleStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverSimpleString" }));

export const SimpleString = LeftoverSimpleString.pipe(
	noLeftover((t) => t[1].leftover, "SimpleString"),
	Schema.transform(Schema.String, {
		decode(template) {
			return template[1].data;
		},
		encode(str): typeof LeftoverSimpleString.Type {
			return [SimpleStringPrefix, { data: str, leftover: "" }];
		},
	}),
);

export class Error_ extends Schema.TaggedError<Error_>()("RespError", {
	message: Schema.String,
}) {}

export const SimpleErrorPrefix = "-";
export const LeftoverErrorSimpleString = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	LeftoverSimpleStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverSimpleStringError" }));

export const ErrorFromSimpleString = LeftoverErrorSimpleString.pipe(
	noLeftover((t) => t[1].leftover, "SimpleStringError"),
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1].data;
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(err): typeof LeftoverErrorSimpleString.Type {
			return [SimpleErrorPrefix, { data: err.message, leftover: "" }];
		},
	}),
);

const BulkStringRegex = /^(\d+)\r\n([\s\S]*)(\r\n[\s\S]*)$/;
const parseIntFromString = ParseResult.decode(IntegerFromString);
const getCrlfPosition = Str.indexOf(CRLF);
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
	{ identifier: "RespString" },
);

export const BulkErrorPrefix = "!";
export const LeftoverBulkStringError = Schema.TemplateLiteralParser(
	BulkErrorPrefix,
	LeftoverBulkStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverBulkStringError" }));

export const ErrorFromBulkString = LeftoverBulkStringError.pipe(
	noLeftover((t) => t[1].leftover, "BulkStringError"),
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1].data;
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(error): typeof LeftoverBulkStringError.Type {
			const data = error.message;
			return [BulkErrorPrefix, { data, leftover: "" }];
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
	{ identifier: "RespStringError" },
);

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
				const expected = Log.expected(
					`{length}${CRLF}{XXX}:{content}${CRLF}{leftover}`,
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
								"Could not locate CRLF in a verbatim string - this should never happen";
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
