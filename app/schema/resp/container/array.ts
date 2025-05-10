import { IntegerFromString } from "$/schema/number";
import { CRLF } from "$/schema/resp/constants";
import { type LeftoverParseResult, noLeftover } from "$/schema/resp/leftover";
import { Log, parseFail } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { Effect, ParseResult, Schema, type SchemaAST, identity } from "effect";
import { type RespData, RespSchema, decodeLeftoverItem } from "./utils";

export const ArrayPrefix = "*";

const ArrayRegex = /^\*(\d+)\r\n([\s\S]*)$/;
const decodeIntFromString = ParseResult.decodeUnknown(IntegerFromString);
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

	const [_match, rawLength, content = ""] = result;
	const length = yield* decodeIntFromString(rawLength);
	return { length, content };
});

export const decodeLeftoverArray = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverParseResult<ReadonlyArray<RespData>>> {
	const { length, content } = yield* decodeArrayLength(input, ast);

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
const NoLeftover = Schema.String.pipe(noLeftover(identity, "RespArray"));
const validateNoleftover = ParseResult.validate(NoLeftover);
export const Array_: Array_ = Schema.declare(
	[Schema.Array(RespSchema)],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const str = yield* decodeString(input);
				const result = yield* decodeLeftoverArray(str, ast);
				yield* validateNoleftover(result.leftover);
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
	{ identifier: "RespArray" },
);
