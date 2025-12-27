import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import type * as SchemaAST from "effect/SchemaAST";
import { Integer } from "$/schema/number";
import { Color, decodeString, namedAst } from "$/schema/utils";
import { ArrayPrefix } from "../constants";
import { RespError } from "../error";
import {
	type LeftoverData,
	type LeftoverParseResult,
	noLeftover,
} from "../utils";
import { decodeLeftoverArray, RespArray } from "./array";
import {
	IntegerPrefix,
	LeftoverInteger,
	Integer as RespInteger,
} from "./integer";
import {
	BulkStringNull,
	LeftoverArrayNull,
	LeftoverBulkStringNull,
} from "./null";
import { Str } from "./string";
import { LeftoverBulkString } from "./string/bulk";
import { LeftoverSimpleError, LeftoverSimpleString } from "./string/simple";

export function decodeLeftoverValue(
	input: string,
	ast: SchemaAST.AST,
): LeftoverParseResult<RespValue> {
	const prefix = input[0];
	switch (prefix) {
		case Str.SimpleStringPrefix: {
			return decodeLeftoverSimpleString(input, ast);
		}
		case Str.SimpleErrorPrefix: {
			return decodeLeftoverSimpleError(input, ast);
		}
		case IntegerPrefix: {
			return decodeLeftoverInteger(input, ast);
		}
		case Str.BulkStringPrefix: {
			return decodeLeftoverBulkValue(input, ast);
		}
		case ArrayPrefix: {
			return decodeLeftoverArrayValue(input, ast);
		}
	}

	const expected = Color.good("{resp_prefix}");
	const received = Color.bad(input);
	const message = `Expected string matching: ${expected}{content}{items}. Received ${received}`;
	const issue = new ParseResult.Type(ast, input, message);
	return ParseResult.fail(issue);
}

const NoLeftover = Schema.String.pipe(noLeftover(Fn.identity, "RespValue"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
const getEncodeFn = Fn.flow(
	Match.type().pipe(
		Match.when(Match.string, () => Str.RespString),
		Match.when(Match.null, () => BulkStringNull),
		Match.when(Arr.isArray, () => RespArray),
		Match.when(Schema.is(Integer), () => RespInteger),
		Match.when(Schema.is(RespError), () => Str.SimpleError),
		Match.option,
	),
	Option.map(Schema.asSchema),
	Option.map(ParseResult.encodeUnknown),
);
export const RespValue = Schema.declare(
	[],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const str = yield* decodeString(input);
				const data = yield* decodeLeftoverValue(str, ast);
				yield* validateNoLeftover(data.leftover);
				return data.data;
			});
		},
		encode() {
			return function (input, opt, ast) {
				const encodeFn = getEncodeFn(input);
				if (Option.isNone(encodeFn)) {
					const expected = Color.good("RespValue");
					const received = Color.bad(input);
					const message = `Expected ${expected}. Received ${received}`;
					const issue = new ParseResult.Type(ast, input, message);
					return ParseResult.fail(issue);
				}

				return encodeFn.value(input, opt);
			};
		},
	},
	{ identifier: "RespValue" },
);

export type RespArrayValue = ReadonlyArray<RespValue>;

export type RespValue = string | Integer | null | RespError | RespArrayValue;

type Decoder<T> = (
	value: string,
	ast: SchemaAST.AST,
) => Effect.Effect<T, ParseResult.ParseIssue>;
type LeftoverDecoder<T> = Decoder<LeftoverData<T>>;

function createDecoder<TType, TEncoded extends string>(
	schema: Schema.Schema<TType, TEncoded>,
): Decoder<TType> {
	const decode = ParseResult.decodeUnknown(schema);
	return function (value) {
		return decode(value);
	};
}

const decodeLeftoverSimpleString: LeftoverDecoder<string> = Fn.flow(
	createDecoder(LeftoverSimpleString),
	Effect.map(([_prefix, data]) => data),
);

const decodeLeftoverBulkStringNull: LeftoverDecoder<null> = Fn.flow(
	createDecoder(LeftoverBulkStringNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const decodeLeftoverBulkString: LeftoverDecoder<string> = Fn.flow(
	createDecoder(LeftoverBulkString),
	Effect.map(([_prefix, data]) => data),
);
const LeftoverBulkValueAST = namedAst("LeftoverBulkValue");
type DecodeBulkValue = LeftoverDecoder<string | null>;
const decodeLeftoverBulkValue: DecodeBulkValue = function (value, ast) {
	return decodeLeftoverBulkStringNull(value, ast).pipe(
		Effect.catchAll((nullIssue) =>
			decodeLeftoverBulkString(value, ast).pipe(
				ParseResult.mapError((arrayIssue) => {
					return new ParseResult.Composite(LeftoverBulkValueAST, value, [
						nullIssue,
						arrayIssue,
					]);
				}),
			),
		),
	);
};

const decodeLeftoverInteger: LeftoverDecoder<Integer> =
	createDecoder(LeftoverInteger);

const decodeLeftoverSimpleError: LeftoverDecoder<RespError> =
	createDecoder(LeftoverSimpleError);

const decodeLeftoverArrayNull: LeftoverDecoder<null> = Fn.flow(
	createDecoder(LeftoverArrayNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const LeftoverArrayValueAST = namedAst("LeftoverArrayValue");
type DecodeArrayValue = LeftoverDecoder<RespArrayValue | null>;
const decodeLeftoverArrayValue: DecodeArrayValue = function (input, ast) {
	return decodeLeftoverArrayNull(input, ast).pipe(
		Effect.catchAll((nullIssue) =>
			decodeLeftoverArray(input, ast).pipe(
				ParseResult.mapError((arrayIssue) => {
					return new ParseResult.Composite(LeftoverArrayValueAST, input, [
						nullIssue,
						arrayIssue,
					]);
				}),
			),
		),
	);
};

export function formatRespValue(value: RespValue): string {
	if (Arr.isArray<RespValue>(value)) {
		return `[${value.map(formatRespValue).join(", ")}]`;
	}

	return String(value);
}
