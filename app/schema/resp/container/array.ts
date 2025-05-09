import { IntegerFromString } from "$/schema/number";
import { CRLF, RawCRLF } from "$/schema/resp/constants";
import type { LeftoverData } from "$/schema/resp/leftover";
import { Number_ } from "$/schema/resp/number";
import { Primitive } from "$/schema/resp/primitive";
import { String_ } from "$/schema/resp/string";
import { Log, parseFail } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { Effect, ParseResult, Schema, type SchemaAST } from "effect";
import { type RespData, RespSchema } from "./utils";

export const ArrayPrefix = "*";

const decodeNextArrayItem = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverData<RespData>, ParseResult.ParseIssue> {
	const prefix = input[0];

	switch (prefix) {
		case String_.SimpleStringPrefix: {
			return yield* ParseResult.decodeUnknown(String_.LeftoverSimpleString)(
				input,
			).pipe(Effect.map(([, data]) => data));
		}
		case String_.BulkStringPrefix: {
			return yield* ParseResult.decodeUnknown(Primitive.LeftoverBulkStringNull)(
				input,
			).pipe(
				Effect.map(([data, leftover]) => ({ data, leftover })),
				Effect.orElse(() =>
					ParseResult.decodeUnknown(String_.LeftoverBulkString)(input).pipe(
						Effect.map(([, data]) => data),
					),
				),
			);
		}
		case String_.VerbatimStringPrefix: {
			return yield* ParseResult.decodeUnknown(String_.LeftoverVerbatimString)(
				input,
			).pipe(Effect.map(([, data]) => data));
		}
		case Number_.IntegerPrefix: {
			return yield* ParseResult.decodeUnknown(Number_.LeftoverInteger)(input);
		}
		case Number_.DoublePrefix: {
			return yield* ParseResult.decodeUnknown(Number_.LeftoverDouble)(input);
		}
		case Number_.BigNumberPrefix: {
			return yield* ParseResult.decodeUnknown(Number_.LeftoverBigNumber)(input);
		}
		case Primitive.BooleanPrefix: {
			return yield* ParseResult.decodeUnknown(Primitive.LeftoverBoolean)(
				input,
			).pipe(Effect.map(([, data, , leftover]) => ({ data, leftover })));
		}
		case Primitive.NullPrefix: {
			return yield* ParseResult.decodeUnknown(Primitive.LeftoverPlainNull)(
				input,
			).pipe(Effect.map(([data, leftover]) => ({ data, leftover })));
		}
		case String_.SimpleErrorPrefix: {
			return yield* ParseResult.decodeUnknown(String_.LeftoverSimpleError)(
				input,
			);
		}
		case String_.BulkErrorPrefix: {
			return yield* ParseResult.decodeUnknown(String_.LeftoverBulkError)(input);
		}
		case ArrayPrefix: {
			return yield* ParseResult.decodeUnknown(Primitive.LeftoverArrayNull)(
				input,
			).pipe(
				Effect.map(([data, leftover]) => ({ data, leftover })),
				Effect.orElse(() => decodeArrayWithRest(input, ast)),
			);
		}
	}

	const expected = Log.expected("${resp_prefix}");
	const received = Log.received(input);
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
		const expected = Log.expected(`${ArrayPrefix}\${integer}${CRLF}\${string}`);
		const received = Log.received(input);
		const message = `Expected string matching: ${expected}. Received ${received}`;
		return yield* parseFail(ast, input, message);
	}

	const [match, length, content = ""] = result;
	if (length === undefined) {
		const expected = Log.expected("${integer}");
		const received = Log.received(match);
		const message = `Expected string to contain length: ${ArrayPrefix}${expected}${RawCRLF}\${string}. Received ${received}`;
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
			const expected = Log.expected(length);
			const received = Log.received(result.length);
			const receivedInput = Log.received(input);
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
					const received = Log.received(result.leftover);
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
