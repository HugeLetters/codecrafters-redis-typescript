import { IntegerFromString } from "$/schema/number";
import { CRLF } from "$/schema/resp/constants";
import { type LeftoverParseResult, noLeftover } from "$/schema/resp/leftover";
import { Log } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { normalize } from "$/utils/string";
import { Effect, ParseResult, Schema, SchemaAST, identity } from "effect";
import {
	type RespData,
	RespSchema,
	decodeLeftoverItem,
	namedAst,
	serializeRespValue,
} from "./utils";

export const ArrayPrefix = "*";

const ArrayRegex = /^\*(\d+)\r\n([\s\S]*)$/;
const decodeIntFromString = ParseResult.decodeUnknown(IntegerFromString);
const RespArrayTemplate = `${ArrayPrefix}{length}${CRLF}{items}`;
const lengthTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespArrayTemplate)}\``),
	namedAst("[Length, Items]"),
	SchemaAST.composeTransformation,
);

const decodeLeftoverArrayLength = function (input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = ArrayRegex.exec(input);
		if (result === null) {
			const expected = Log.good(RespArrayTemplate);
			const received = Log.bad(input);
			const message = `Expected string matching: ${expected}. Received ${received}`;
			const issue = new ParseResult.Type(ast, input, message);
			return yield* ParseResult.fail(issue);
		}

		const [_match, rawLength, items = ""] = result;
		const length = yield* decodeIntFromString(rawLength).pipe(
			ParseResult.mapError(
				(issue) => new ParseResult.Pointer("Length", rawLength, issue),
			),
		);

		return { length, items };
	});

	return decodeResult.pipe(
		ParseResult.mapError((issue) => {
			return new ParseResult.Transformation(
				lengthTransform,
				input,
				"Encoded",
				issue,
			);
		}),
	);
};

const decodeString = ParseResult.decodeUnknown(Schema.String);
export const decodeLeftoverArray = function (
	input: unknown,
	toAst: SchemaAST.AST,
) {
	const ast = new SchemaAST.Transformation(
		SchemaAST.stringKeyword,
		SchemaAST.typeAST(toAst),
		SchemaAST.composeTransformation,
	);

	type DecodeResult = EffectGen<LeftoverParseResult<ReadonlyArray<RespData>>>;
	const decodeResult = Effect.gen(function* (): DecodeResult {
		const str = yield* decodeString(input);
		const { length, items } = yield* decodeLeftoverArrayLength(str, ast);

		const result: Array<RespData> = [];
		let encoded = items;
		while (result.length !== length) {
			if (encoded === "") {
				const expected = Log.good(length);
				const received = Log.bad(result.length);
				const receivedItems = Log.bad(serializeRespValue(result));
				const receivedInput = Log.bad(str);
				const message = `Expected ${expected} item(s). Decoded ${received} item(s) in ${receivedItems} from ${receivedInput}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const { data, leftover } = yield* decodeLeftoverItem(encoded, ast).pipe(
				ParseResult.mapError((issue) => {
					const receivedInput = Log.bad(encoded);
					const message = `Decoded ${Log.good(serializeRespValue(result))} but encountered error at ${receivedInput}`;
					const itemAst = namedAst(message);
					return new ParseResult.Composite(itemAst, items, issue);
				}),
			);

			result.push(data);
			encoded = leftover;
		}

		return { data: result, leftover: encoded };
	});

	return decodeResult.pipe(
		ParseResult.mapError(
			(issue) => new ParseResult.Transformation(ast, input, "Encoded", issue),
		),
	);
};

type Array_ = Schema.Schema<ReadonlyArray<RespData>, string>;
const NoLeftover = Schema.String.pipe(noLeftover(identity, "RespArray"));
const validateNoleftover = ParseResult.validate(NoLeftover);
export const Array_: Array_ = Schema.declare(
	[Schema.Array(RespSchema)],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverArray(input, ast);
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
