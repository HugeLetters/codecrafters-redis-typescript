import { CRLF } from "$/schema/resp/constants";
import { type LeftoverParseResult, noLeftover } from "$/schema/resp/leftover";
import {
	RespData,
	type RespMapValue,
	decodeLeftoverValue,
} from "$/schema/resp/main";
import { Log, decodeString, namedAst } from "$/schema/utils";
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
import { AttributePrefix } from "./prefix";
import {
	decodeIntFromString,
	entryPlural,
	hashableRespValue,
	serializeRespValue,
} from "./utils";

const AttributeRegex = /^\|(\d+)\r\n([\s\S]*)$/;
const AttributeTemplate = `${AttributePrefix}{size}${CRLF}{entries}`;
const sizeTransform = new SchemaAST.Transformation(
	namedAst(`\`${normalize(AttributeTemplate)}\``),
	namedAst("[Size, Entries<Key, Value>]"),
	SchemaAST.composeTransformation,
);

function decodeLeftoverAttributeSize(input: string, ast: SchemaAST.AST) {
	const decodeResult = Effect.gen(function* () {
		const result = AttributeRegex.exec(input);
		if (result === null) {
			const expected = Log.good(AttributeTemplate);
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
}

export function decodeLeftoverAttribute(input: unknown, toAst: SchemaAST.AST) {
	const ast = new SchemaAST.Transformation(
		SchemaAST.stringKeyword,
		SchemaAST.typeAST(toAst),
		SchemaAST.composeTransformation,
	);

	type DecodeResult = EffectGen<LeftoverParseResult<RespMapValue>>;
	const decodeResult = Effect.gen(function* (): DecodeResult {
		const str = yield* decodeString(input);
		const { size, entries } = yield* decodeLeftoverAttributeSize(str, ast);

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

			const key = yield* decodeLeftoverValue(encoded, ast).pipe(
				Effect.mapError((issue) => {
					const receivedInput = Log.bad(encoded);
					const decoded = Log.good(serializeRespValue(map));
					const message = `Decoded ${decoded} but got invalid key at ${receivedInput}`;
					return new ParseResult.Composite(namedAst(message), entries, issue);
				}),
			);
			const value = yield* decodeLeftoverValue(key.leftover, ast).pipe(
				Effect.mapError((issue) => {
					const receivedInput = Log.bad(key.leftover);
					const decoded = Log.good(serializeRespValue(map));
					const receivedKey = Log.good(serializeRespValue(key.data));
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

type Attribute = Schema.Schema<RespMapValue, string>;
const NoLeftover = Schema.String.pipe(noLeftover(identity, "Attribute"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
const EncodingSchema = Schema.suspend(() => {
	return Schema.HashMapFromSelf({ key: RespData, value: RespData });
});
export const Attribute: Attribute = Schema.declare(
	[EncodingSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const result = yield* decodeLeftoverAttribute(input, ast);
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
				const result = `${AttributePrefix}${HashMap.size(map)}${CRLF}${encoded}`;
				return yield* ParseResult.succeed(result);
			});
		},
	},
	{ identifier: "Attribute" },
);
