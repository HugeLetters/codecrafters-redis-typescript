import { IntegerFromString } from "$/schema/number";
import { CRLF, RawCRLF } from "$/schema/resp/constants";
import type { LeftoverParseResult } from "$/schema/resp/leftover";
import { Log, parseFail } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { Effect, ParseResult, Schema, type SchemaAST } from "effect";
import { type RespData, RespSchema, decodeLeftoverItem } from "./utils";

export const ArrayPrefix = "*";

const ArrayRegex = /^\*(\d+)\r\n([\s\S]*)$/;
const decodeIntFromString = ParseResult.decode(IntegerFromString);
const decodeArrayLength = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
) {
	const result = ArrayRegex.exec(input);
	if (result === null) {
		const expected = Log.expected(`${ArrayPrefix}{length}${CRLF}{items}`);
		const received = Log.received(input);
		const message = `Expected string matching: ${expected}. Received ${received}`;
		return yield* parseFail(ast, input, message);
	}

	const [match, length, content = ""] = result;
	if (length === undefined) {
		const expected = Log.expected("{length}");
		const received = Log.received(match);
		const message = `Expected string to contain length: ${ArrayPrefix}${expected}${RawCRLF}{string}. Received ${received}`;
		return yield* parseFail(ast, input, message);
	}

	const parsedLength = yield* decodeIntFromString(length);

	return { length: parsedLength, content };
});

// todo - turn this into a schema with a transform to array_ schema
export const decodeLeftoverArray = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverParseResult<ReadonlyArray<RespData>>> {
	const { length, content } = yield* decodeArrayLength(input, ast);

	if (length === 0) {
		return { data: [], leftover: content };
	}

	const result: Array<RespData> = [];
	let encoded = content;
	while (result.length !== length) {
		if (encoded === "") {
			const expected = Log.expected(length);
			const received = Log.received(result.length);
			const receivedInput = Log.received(input);
			const message = `Expected array of length ${expected}. Received ${received} elements decoded from ${receivedInput}`;
			return yield* parseFail(ast, input, message);
		}

		const { data, leftover } = yield* decodeLeftoverItem(encoded, ast);
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
				const result = yield* decodeLeftoverArray(str, ast);

				if (result.leftover !== "") {
					const received = Log.received(result.leftover);
					const message = `Array contains unexpected data at the tail: ${received}`;
					yield* parseFail(ast, input, message);
				}

				return result.data;
			});
		},
		encode(schema) {
			const encode = ParseResult.encodeUnknown(schema);
			return Effect.fn(function* (input, _opt) {
				const encoded = yield* encode(input);
				const result = `${ArrayPrefix}${encoded.length}${CRLF}${encoded.join("")}`;
				return yield* ParseResult.succeed(result);
			});
		},
	},
	{},
);
