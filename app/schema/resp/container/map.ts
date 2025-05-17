import { CRLF } from "$/schema/resp/constants";
import { type LeftoverParseResult, noLeftover } from "$/schema/resp/leftover";
import { Log } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { normalize } from "$/utils/string";
import {
	Effect,
	HashMap,
	Iterable,
	ParseResult,
	Schema,
	SchemaAST,
	identity,
} from "effect";
import {
	type RespMapValue,
	RespSchema,
	decodeIntFromString,
	decodeLeftoverItem,
	hashableRespValue,
	namedAst,
	serializeRespValue,
} from "./utils";

export const MapPrefix = "%";

const MapRegex = /^%(\d+)\r\n([\s\S]*)$/;
const RespMapTemplate = `${MapPrefix}{size}${CRLF}{items}`;
const sizeTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespMapTemplate)}\``),
	namedAst("[Size, Items<Key, Value>]"),
	SchemaAST.composeTransformation,
);

const decodeLeftoverMapSize = function (input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = MapRegex.exec(input);
		if (result === null) {
			const expected = Log.good(RespMapTemplate);
			const received = Log.bad(input);
			const message = `Expected string matching: ${expected}. Received ${received}`;
			const issue = new ParseResult.Type(ast, input, message);
			return yield* ParseResult.fail(issue);
		}

		const [_match, rawSize, items = ""] = result;
		const size = yield* decodeIntFromString(rawSize).pipe(
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
};

const decodeString = ParseResult.decodeUnknown(Schema.String);
export const decodeLeftoverMap = function (
	input: unknown,
	toAst: SchemaAST.AST,
) {
	const ast = new SchemaAST.Transformation(
		SchemaAST.stringKeyword,
		SchemaAST.typeAST(toAst),
		SchemaAST.composeTransformation,
	);

	type DecodeResult = EffectGen<LeftoverParseResult<RespMapValue>>;
	const decodeResult = Effect.gen(function* (): DecodeResult {
		const str = yield* decodeString(input);
		const { size, items } = yield* decodeLeftoverMapSize(str, ast);

		let map: RespMapValue = HashMap.empty().pipe(HashMap.beginMutation);

		let encoded = items;
		while (HashMap.size(map) !== size) {
			if (encoded === "") {
				const expected = Log.good(size);
				const received = Log.bad(HashMap.size(map));
				const receivedItems = Log.bad(serializeRespValue(map));
				const receivedInput = Log.bad(str);
				const message = `Expected ${expected} item(s). Decoded ${received} item(s) in ${receivedItems} from ${receivedInput}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const { key, value } = yield* Effect.Do.pipe(
				Effect.bind("key", () => decodeLeftoverItem(encoded, ast)),
				Effect.bind("value", ({ key }) =>
					decodeLeftoverItem(key.leftover, ast),
				),
				Effect.mapError((issue) => {
					const receivedInput = Log.bad(encoded);
					const decoded = Log.good(serializeRespValue(map));
					const message = `Decoded ${decoded} but encountered error at ${receivedInput}`;
					const itemAst = namedAst(message);
					return new ParseResult.Composite(itemAst, items, issue);
				}),
			);

			map = HashMap.set(map, hashableRespValue(key.data), value.data);
			encoded = value.leftover;
		}

		return { data: HashMap.endMutation(map), leftover: encoded };
	});

	return decodeResult.pipe(
		ParseResult.mapError(
			(issue) => new ParseResult.Transformation(ast, input, "Encoded", issue),
		),
	);
};

type Map_ = Schema.Schema<RespMapValue, string>;
const NoLeftover = Schema.String.pipe(noLeftover(identity, "RespMap"));
const validateNoleftover = ParseResult.validate(NoLeftover);
const EncodingSchema = Schema.suspend(() => {
	return Schema.HashMapFromSelf({ key: RespSchema, value: RespSchema });
});
export const Map_: Map_ = Schema.declare(
	[EncodingSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverMap(input, ast);
				yield* validateNoleftover(result.leftover);
				return result.data;
			});
		},
		encode(schema) {
			const encode = ParseResult.encodeUnknown(schema);
			const stringifyMap = Iterable.reduce(
				"",
				(result, [key, value]: [string, string]) => `${result}${key}${value}`,
			);

			return Effect.fn(function* (input, _opt) {
				const map = yield* encode(input);
				const encoded = stringifyMap(map);
				const result = `${MapPrefix}${HashMap.size(map)}${CRLF}${encoded}`;
				return yield* ParseResult.succeed(result);
			});
		},
	},
	{ identifier: "RespMap" },
);
