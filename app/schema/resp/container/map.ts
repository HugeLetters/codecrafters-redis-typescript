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
	decodeLeftoverValue,
	decodeString,
	entryPlural,
	hashableRespValue,
	namedAst,
	serializeRespValue,
} from "./utils";

export const MapPrefix = "%";

const MapRegex = /^%(\d+)\r\n([\s\S]*)$/;
const RespMapTemplate = `${MapPrefix}{size}${CRLF}{entries}`;
const sizeTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespMapTemplate)}\``),
	namedAst("[Size, Entries<Key, Value>]"),
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

		const [_match, rawSize, entries = ""] = result;
		const size = yield* decodeIntFromString(rawSize).pipe(
			ParseResult.mapError(
				(issue) => new ParseResult.Pointer("Size", rawSize, issue),
			),
		);

		return { size, entries };
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
		const { size, entries } = yield* decodeLeftoverMapSize(str, ast);

		let map: RespMapValue = HashMap.empty().pipe(HashMap.beginMutation);

		let encoded = entries;
		while (HashMap.size(map) !== size) {
			if (encoded === "") {
				const expectedSize = Log.good(size);
				const expected = `Expected ${expectedSize} ${entryPlural(size)}`;

				const receivedSize = HashMap.size(map);
				const receivedEntries = Log.bad(serializeRespValue(map));
				const receivedInput = Log.bad(str);
				const received = `Decoded ${Log.bad(receivedSize)} ${entryPlural(receivedSize)} in ${receivedEntries} from ${receivedInput}`;

				const message = `${expected}. ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const { key, value } = yield* Effect.Do.pipe(
				Effect.bind("key", () => decodeLeftoverValue(encoded, ast)),
				Effect.bind("value", ({ key }) =>
					decodeLeftoverValue(key.leftover, ast),
				),
				Effect.mapError((issue) => {
					const receivedInput = Log.bad(encoded);
					const decoded = Log.good(serializeRespValue(map));
					const message = `Decoded ${decoded} but encountered error at ${receivedInput}`;
					return new ParseResult.Composite(namedAst(message), entries, issue);
				}),
			);

			map = HashMap.set(map, hashableRespValue(key.data), value.data);
			encoded = value.leftover;
		}

		const data = HashMap.endMutation(map);
		return { data, leftover: encoded };
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
