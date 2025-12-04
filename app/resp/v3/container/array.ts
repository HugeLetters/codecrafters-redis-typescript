import { regex } from "arkregex";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { ArrayPrefix, CRLF } from "$/resp/constants";
import {
	itemPlural,
	type LeftoverParseResult,
	noLeftover,
	parseIntFromString,
} from "$/resp/utils";
import { Color, decodeString, namedAst } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { normalize } from "$/utils/string";
import {
	decodeLeftoverValue,
	formatRespValue,
	type RespArrayValue,
	RespValue,
} from "../main";

const ArrayRegex = regex(
	`^\\${ArrayPrefix}(?<length>\\d+)${CRLF}(?<items>[\\s\\S]*)$`,
);
const RespArrayTemplate = `${ArrayPrefix}{length}${CRLF}{items}`;
const lengthTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespArrayTemplate)}\``),
	namedAst("[Length, Items]"),
	SchemaAST.composeTransformation,
);

function decodeLeftoverArrayLength(input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = ArrayRegex.exec(input);
		if (result === null) {
			const expected = Color.good(RespArrayTemplate);
			const received = Color.bad(input);
			const message = `Expected string matching: ${expected}. Received ${received}`;
			const issue = new ParseResult.Type(ast, input, message);
			return yield* ParseResult.fail(issue);
		}

		const { length: rawLength, items } = result.groups;
		const length = yield* parseIntFromString(rawLength).pipe(
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
}

export function decodeLeftoverArray(input: unknown, toAst: SchemaAST.AST) {
	const ast = new SchemaAST.Transformation(
		SchemaAST.stringKeyword,
		SchemaAST.typeAST(toAst),
		SchemaAST.composeTransformation,
	);

	type DecodeResult = EffectGen<LeftoverParseResult<RespArrayValue>>;
	const decodeResult = Effect.gen(function* (): DecodeResult {
		const str = yield* decodeString(input);
		const { length, items } = yield* decodeLeftoverArrayLength(str, ast);

		const array: Array<RespValue> = [];
		let encoded = items;
		while (array.length !== length) {
			if (encoded === "") {
				const expectedLength = Color.good(length);
				const expected = `Expected ${expectedLength} ${itemPlural(length)}`;

				const receivedLength = Color.bad(array.length);
				const receivedItems = Color.bad(formatRespValue(array));
				const receivedInput = Color.bad(str);
				const received = `Decoded ${receivedLength} ${itemPlural(array.length)} in ${receivedItems} from ${receivedInput}`;

				const message = `${expected}. ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const { data, leftover } = yield* decodeLeftoverValue(encoded, ast).pipe(
				ParseResult.mapError((issue) => {
					const receivedInput = Color.bad(encoded);
					const decoded = Color.good(formatRespValue(array));
					const message = `Decoded ${decoded} but got invalid item at ${receivedInput}`;
					return new ParseResult.Composite(namedAst(message), items, issue);
				}),
			);

			array.push(data);
			encoded = leftover;
		}

		return { data: array, leftover: encoded };
	});

	return decodeResult.pipe(
		ParseResult.mapError(
			(issue) => new ParseResult.Transformation(ast, input, "Encoded", issue),
		),
	);
}

type RespArray = Schema.Schema<RespArrayValue, string>;
const NoLeftover = Schema.String.pipe(noLeftover(Fn.identity, "RespArray"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
const EncodingSchema = Schema.suspend(() => Schema.Array(RespValue));
export const RespArray: RespArray = Schema.declare(
	[EncodingSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverArray(input, ast);
				yield* validateNoLeftover(result.leftover);
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

export { ArrayPrefix };
