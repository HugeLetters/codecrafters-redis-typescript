import { IntegerFromString } from "$/schema/number";
import {
	BigNumber,
	BigNumberPrefix,
	Double,
	DoublePrefix,
	Integer,
	IntegerPrefix,
} from "$/schema/resp/number";
import {
	ArrayNull,
	BooleanPrefix,
	Boolean_,
	BulkStringNull,
	NullPrefix,
	PlainNull,
} from "$/schema/resp/primitives";
import {
	BulkErrorPrefix,
	BulkString,
	BulkStringPrefix,
	ErrorFromBulkString,
	ErrorFromSimpleString,
	SimpleErrorPrefix,
	SimpleString,
	SimpleStringPrefix,
	VerbatimStringFromString,
	VerbatimStringPrefix,
} from "$/schema/resp/string";
import { ParseFailLog, parseFail } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { Effect, ParseResult, Schema, type SchemaAST } from "effect";
import { CRLF } from "../constants";
import { type RespData, RespSchema } from "./shared";
import type { LeftoverData } from "../leftover";

export const ArrayPrefix = "*";

const regexDecoder = function (regex: RegExp) {
	return Effect.fn(function* <T, E extends string>(
		input: string,
		schema: Schema.Schema<T, E>,
		ast: SchemaAST.AST,
	): EffectGen<LeftoverData<T>, ParseResult.ParseIssue> {
		const result = regex.exec(input);
		if (result === null) {
			const expected = ParseFailLog.expected(regex.source);
			const received = ParseFailLog.received(input);
			const message = `Expected string matching: ${expected}. Received ${received}`;
			return yield* parseFail(ast, input, message);
		}

		const [_match, element, leftover = ""] = result;
		const parsed = yield* ParseResult.decodeUnknown(schema)(element);
		return { data: parsed, leftover };
	});
};

const SimpleArrayElementRegex = /([\s\S]+?\r\n)([\s\S]*)/;
const decodeSimpleElement = regexDecoder(SimpleArrayElementRegex);
const PrefixedStringArrayRegex = /([\s\S]+?\r\n[\s\S]+?\r\n)([\s\S]*)/;
const decodePrefixedString = regexDecoder(PrefixedStringArrayRegex);

const decodeNextArrayItem = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverData<RespData>, ParseResult.ParseIssue> {
	const prefix = input[0];

	switch (prefix) {
		case SimpleStringPrefix: {
			return yield* decodeSimpleElement(input, SimpleString, ast);
		}
		case BulkStringPrefix: {
			return yield* decodeSimpleElement(input, BulkStringNull, ast).pipe(
				Effect.orElse(() => decodePrefixedString(input, BulkString, ast)),
			);
		}
		case VerbatimStringPrefix: {
			return yield* decodePrefixedString(input, VerbatimStringFromString, ast);
		}
		case IntegerPrefix: {
			return yield* decodeSimpleElement(input, Integer, ast);
		}
		case DoublePrefix: {
			return yield* decodeSimpleElement(input, Double, ast);
		}
		case BigNumberPrefix: {
			return yield* decodeSimpleElement(input, BigNumber, ast);
		}
		case BooleanPrefix: {
			return yield* decodeSimpleElement(input, Boolean_, ast);
		}
		case NullPrefix: {
			return yield* decodeSimpleElement(input, PlainNull, ast);
		}
		case SimpleErrorPrefix: {
			return yield* decodeSimpleElement(input, ErrorFromSimpleString, ast);
		}
		case BulkErrorPrefix: {
			return yield* decodePrefixedString(input, ErrorFromBulkString, ast);
		}
		case ArrayPrefix: {
			return yield* decodeSimpleElement(input, ArrayNull, ast).pipe(
				Effect.orElse(() => decodeArrayWithRest(input, ast)),
			);
		}
	}

	const expected = ParseFailLog.expected("${resp_prefix}");
	const received = ParseFailLog.received(input);
	const message = `Expected string matching: ${expected}\${string}. Received ${received}`;
	return yield* parseFail(ast, input, message);
});

const ArrayRegex = /^\*(\d+)\r\n([\s\S]*)$/;
const decodeIntFromString = ParseResult.decode(IntegerFromString);
const decodeArrayLength = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
) {
	const result = ArrayRegex.exec(input);
	if (result === null) {
		const expected = ParseFailLog.expected(
			`${ArrayPrefix}\${integer}\r\n\${string}`,
		);
		const received = ParseFailLog.received(input);
		const message = `Expected string matching: ${expected}. Received ${received}`;
		return yield* parseFail(ast, input, message);
	}

	const [match, length, content = ""] = result;
	if (length === undefined) {
		const expected = ParseFailLog.expected("${integer}");
		const received = ParseFailLog.received(match);
		const message = `Expected string to contain length: ${ArrayPrefix}${expected}\\r\\n\${string}. Received ${received}`;
		return yield* parseFail(ast, input, message);
	}

	const parsedLength = yield* decodeIntFromString(length);

	return { length: parsedLength, content };
});

const decodeArrayWithRest = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverData<ReadonlyArray<RespData>>, ParseResult.ParseIssue> {
	const { length, content } = yield* decodeArrayLength(input, ast);

	if (length === 0) {
		return { data: [], leftover: content };
	}

	const result: Array<RespData> = [];
	let encoded = content;
	while (result.length !== length) {
		if (encoded === "") {
			const expected = ParseFailLog.expected(length);
			const received = ParseFailLog.received(result.length);
			const receivedInput = ParseFailLog.received(input);
			const message = `Expected array of length ${expected}. Received ${received} elements decoded from ${receivedInput}`;
			return yield* parseFail(ast, input, message);
		}

		const { data, leftover } = yield* decodeNextArrayItem(encoded, ast);
		result.push(data);
		encoded = leftover;
	}

	return { data: result, leftover: encoded };
});

type Array_ = Schema.Schema<ReadonlyArray<RespData>, string>;
const decodeString = ParseResult.decodeUnknown(Schema.String);
export const Array_: Array_ = Schema.declare(
	[Schema.Array(RespSchema)],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const str = yield* decodeString(input);
				const result = yield* decodeArrayWithRest(str, ast);

				if (result.leftover !== "") {
					const received = ParseFailLog.received(result.leftover);
					const message = `Array contains unexpected data at the tail: ${received}`;
					yield* parseFail(ast, input, message);
				}

				return result.data;
			});
		},
		encode(schema) {
			const encode = ParseResult.encodeUnknown(schema);
			return Effect.fn(function* (input, _opt, ast) {
				const encoded = yield* encode(input);
				const result = `${ArrayPrefix}${encoded.length}${CRLF}${encoded.join("")}`;
				return yield* ParseResult.succeed(result);
			});
		},
	},
	{},
);
