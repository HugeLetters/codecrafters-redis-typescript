import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Iterable from "effect/Iterable";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { CRLF } from "$/schema/resp/constants";
import { type LeftoverParseResult, noLeftover } from "$/schema/resp/leftover";
import {
	decodeLeftoverValue,
	formatRespValue,
	hashableRespValue,
	type RespMapValue,
	RespValue,
} from "$/schema/resp/main";
import { Color, decodeString, namedAst } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { normalize } from "$/utils/string";
import { MapPrefix } from "./prefix";
import { decodeIntFromString, entryPlural } from "./utils";

const MapRegex = /^%(\d+)\r\n([\s\S]*)$/;
const RespMapTemplate = `${MapPrefix}{size}${CRLF}{entries}`;
const sizeTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(RespMapTemplate)}\``),
	namedAst("[Size, Entries<Key, Value>]"),
	SchemaAST.composeTransformation,
);

function decodeLeftoverMapSize(input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = MapRegex.exec(input);
		if (result === null) {
			const expected = Color.good(RespMapTemplate);
			const received = Color.bad(input);
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
}

export function decodeLeftoverMap(input: unknown, toAst: SchemaAST.AST) {
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
				const expectedSize = Color.good(size);
				const expected = `Expected ${expectedSize} ${entryPlural(size)}`;

				const receivedSize = HashMap.size(map);
				const receivedEntries = Color.bad(formatRespValue(map));
				const receivedInput = Color.bad(str);
				const received = `Decoded ${Color.bad(receivedSize)} ${entryPlural(receivedSize)} in ${receivedEntries} from ${receivedInput}`;

				const message = `${expected}. ${received}`;
				const issue = new ParseResult.Type(ast, str, message);
				return yield* ParseResult.fail(issue);
			}

			const key = yield* decodeLeftoverValue(encoded, ast).pipe(
				Effect.mapError((issue) => {
					const receivedInput = Color.bad(encoded);
					const decoded = Color.good(formatRespValue(map));
					const message = `Decoded ${decoded} but got invalid key at ${receivedInput}`;
					return new ParseResult.Composite(namedAst(message), entries, issue);
				}),
			);
			const value = yield* decodeLeftoverValue(key.leftover, ast).pipe(
				Effect.mapError((issue) => {
					const receivedInput = Color.bad(key.leftover);
					const decoded = Color.good(formatRespValue(map));
					const receivedKey = Color.good(formatRespValue(key.data));
					const message = `Decoded ${decoded} but key ${receivedKey} has invalid value at ${receivedInput}`;
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
}

type Map_ = Schema.Schema<RespMapValue, string>;
const NoLeftover = Schema.String.pipe(noLeftover(Fn.identity, "RespMap"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
const EncodingSchema = Schema.suspend(() => {
	return Schema.HashMapFromSelf({ key: RespValue, value: RespValue });
});
export const Map_: Map_ = Schema.declare(
	[EncodingSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverMap(input, ast);
				yield* validateNoLeftover(result.leftover);
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
