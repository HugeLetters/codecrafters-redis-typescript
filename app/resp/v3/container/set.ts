import { regex } from "arkregex";
import type * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Iterable from "effect/Iterable";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { CRLF } from "$/resp/constants";
import {
	itemPlural,
	type LeftoverParseResult,
	noLeftover,
	parseIntFromString,
	RegexUtils,
} from "$/resp/utils";
import { Color, decodeString, namedAst } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { normalize } from "$/utils/string";
import {
	decodeLeftoverValue,
	formatRespValue,
	type RespSetValue,
	RespValue,
} from "../main";
import { SetPrefix } from "./prefix";

const SetRegex = regex(
	`^${SetPrefix}(?<size>${RegexUtils.Digit}+)${CRLF}(?<items>.*)$`,
	"s",
);
const RespSetTemplate = `${SetPrefix}{size}${CRLF}{items}`;
const sizeTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespSetTemplate)}\``),
	namedAst("[Size, Items]"),
	SchemaAST.composeTransformation,
);

function decodeLeftoverSetSize(input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = SetRegex.exec(input);
		if (result === null) {
			const expected = Color.good(RespSetTemplate);
			const received = Color.bad(input);
			const message = `Expected string matching: ${expected}. Received ${received}`;
			const issue = new ParseResult.Type(ast, input, message);
			return yield* ParseResult.fail(issue);
		}

		const { size: rawSize, items } = result.groups;
		const size = yield* parseIntFromString(rawSize).pipe(
			ParseResult.mapError(
				(issue) => new ParseResult.Pointer("Size", rawSize, issue),
			),
		);

		return { size, items };
	});

	return decodeResult.pipe(
		ParseResult.mapError((issue) => {
			return new ParseResult.Transformation(
				sizeTransform,
				input,
				"Encoded",
				issue,
			);
		}),
	);
}

export function decodeLeftoverSet(input: unknown, toAst: SchemaAST.AST) {
	const ast = new SchemaAST.Transformation(
		SchemaAST.stringKeyword,
		SchemaAST.typeAST(toAst),
		SchemaAST.composeTransformation,
	);

	type DecodeResult = EffectGen<LeftoverParseResult<RespSetValue>>;
	const decodeResult = Effect.gen(function* (): DecodeResult {
		const str = yield* decodeString(input);
		const { size, items } = yield* decodeLeftoverSetSize(str, ast);

		let set: RespSetValue = HashSet.empty().pipe(HashSet.beginMutation);
		let encoded = items;
		while (HashSet.size(set) !== size) {
			if (encoded === "") {
				const expectedSize = Color.good(size);
				const expected = `Expected ${expectedSize} ${itemPlural(size)}`;

				const receivedSize = HashSet.size(set);
				const receivedItems = Color.bad(formatRespValue(set));
				const receivedInput = Color.bad(str);
				const received = `Decoded ${Color.good(receivedSize)} ${itemPlural(receivedSize)} in ${receivedItems} from ${receivedInput}`;

				const message = `${expected}. ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const { data, leftover } = yield* decodeLeftoverValue(encoded, ast).pipe(
				ParseResult.mapError((issue) => {
					const receivedInput = Color.bad(encoded);
					const decoded = Color.good(formatRespValue(set));
					const message = `Decoded ${decoded} but got invalid item at ${receivedInput}`;
					return new ParseResult.Composite(namedAst(message), items, issue);
				}),
			);

			set = HashSet.add(set, data);
			encoded = leftover;
		}

		const data = HashSet.endMutation(set);
		return { data, leftover: encoded };
	});

	return decodeResult.pipe(
		ParseResult.mapError(
			(issue) => new ParseResult.Transformation(ast, input, "Encoded", issue),
		),
	);
}

type RespSet = Schema.Schema<RespSetValue, string>;
const NoLeftover = Schema.String.pipe(noLeftover(Fn.identity, "RespSet"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
const EncodingSchema = Schema.suspend(() => Schema.HashSetFromSelf(RespValue));
/**
 * If stored value is an array - to perform operations with it, you need to pass an array created with {@link Data.array}
 * @example
 * const data = [1, 2, 3];
 * const set = HashSet.make([data,'value'])
 * const encoded = yield* Schema.encode(RespSet)(set);
 * const decoded = yield* Schema.decode(RespSet)(encoded);
 * console.log(HashSet.has(decoded, Data.array([1, 2, 3]))) // true
 */
export const RespSet: RespSet = Schema.declare(
	[EncodingSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverSet(input, ast);
				yield* validateNoLeftover(result.leftover);
				return result.data;
			});
		},
		encode(schema) {
			const encode = ParseResult.encodeUnknown(schema);
			const stringifySet = Iterable.reduce(
				"",
				(result, value: string) => `${result}${value}`,
			);

			return Effect.fn(function* (input, _opt) {
				const set = yield* encode(input);
				const encoded = stringifySet(set);
				const result = `${SetPrefix}${HashSet.size(set)}${CRLF}${encoded}`;
				return yield* ParseResult.succeed(result);
			});
		},
	},
	{ identifier: "RespSet" },
);
