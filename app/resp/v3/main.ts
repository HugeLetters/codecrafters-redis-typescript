import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Iterable from "effect/Iterable";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import type * as SchemaAST from "effect/SchemaAST";
import { V2 } from "$/resp/v2";
import { LeftoverInteger } from "$/resp/v2/integer";
import { LeftoverBulkString } from "$/resp/v2/string/bulk";
import {
	LeftoverSimpleError,
	LeftoverSimpleString,
} from "$/resp/v2/string/simple";
import { Integer } from "$/schema/number";
import { Color, decodeString, namedAst } from "$/schema/utils";
import { RespError } from "../error";
import {
	type LeftoverData,
	type LeftoverParseResult,
	noLeftover,
} from "../utils";
import { LeftoverArrayNull, LeftoverBulkStringNull } from "../v2/null";
import { ArrayPrefix, decodeLeftoverArray, RespArray } from "./container/array";
import { decodeLeftoverAttribute } from "./container/attribute";
import {
	decodeLeftoverMap as decodeLeftoverMap_,
	RespMap,
} from "./container/map";
import { AttributePrefix, MapPrefix, SetPrefix } from "./container/prefix";
import {
	decodeLeftoverSet as decodeLeftoverSet_,
	RespSet,
} from "./container/set";
import { Num } from "./number";
import { LeftoverBigNumber } from "./number/bigNumber";
import { LeftoverDouble } from "./number/double";
import { Primitive } from "./primitive";
import { LeftoverBoolean } from "./primitive/boolean";
import { LeftoverPlainNull } from "./primitive/null";
import { Str } from "./string";
import { LeftoverBulkError } from "./string/bulk";
import { LeftoverVerbatimString } from "./string/verbatim";

export function decodeLeftoverValue(
	input: string,
	ast: SchemaAST.AST,
): LeftoverParseResult<RespValue> {
	const prefix = input[0];
	switch (prefix) {
		case V2.String.SimpleStringPrefix: {
			return decodeLeftoverSimpleString(input, ast);
		}
		case V2.String.BulkStringPrefix: {
			return decodeLeftoverBulkValue(input, ast);
		}
		case Str.VerbatimStringPrefix: {
			return decodeLeftoverVerbatimString(input, ast);
		}
		case V2.IntegerPrefix: {
			return decodeLeftoverInteger(input, ast);
		}
		case Num.DoublePrefix: {
			return decodeLeftoverDouble(input, ast);
		}
		case Num.BigNumberPrefix: {
			return decodeLeftoverBigNumber(input, ast);
		}
		case Primitive.BooleanPrefix: {
			return decodeLeftoverBoolean(input, ast);
		}
		case Primitive.NullPrefix: {
			return decodeLeftoverPlainNull(input, ast);
		}
		case V2.String.SimpleErrorPrefix: {
			return decodeLeftoverSimpleError(input, ast);
		}
		case Str.BulkErrorPrefix: {
			return decodeLeftoverBulkError(input, ast);
		}
		case ArrayPrefix: {
			return decodeLeftoverArrayValue(input, ast);
		}
		case MapPrefix: {
			return decodeLeftoverMap(input, ast);
		}
		case SetPrefix: {
			return decodeLeftoverSet(input, ast);
		}
		case AttributePrefix: {
			return skipLeftoverAttribute(input, ast);
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
		Match.when(Match.string, () => V2.String.RespString),

		Match.when(Schema.is(Integer), () => V2.Integer),
		Match.when(Match.number, () => Num.Double),

		Match.when(Match.bigint, () => Num.BigNumber),

		Match.when(Match.null, () => Primitive.Null),
		Match.when(Match.boolean, () => Primitive.Boolean),

		Match.when(Arr.isArray, () => RespArray),
		Match.when(HashMap.isHashMap, () => RespMap),
		Match.when(HashSet.isHashSet, () => RespSet),

		Match.when(
			Schema.is(Str.VerbatimString),
			() => Str.VerbatimStringFromString,
		),
		Match.when(Schema.is(RespError), () => Str.RespErrorFromString),

		Match.option,
	),
	Option.map(Fn.flow(Schema.asSchema, ParseResult.encodeUnknown)),
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

export type RespValue =
	| Exclude<V2.RespValue, V2.RespArrayValue>
	| boolean
	| number
	| bigint
	| Str.VerbatimString
	| RespArrayValue
	| RespSetValue
	| RespMapValue;

export type RespArrayValue = ReadonlyArray<RespValue>;
export type RespMapValue = HashMap.HashMap<RespValue, RespValue>;
export type RespSetValue = HashSet.HashSet<RespValue>;

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
	Effect.map(([, data]) => data),
);

const decodeLeftoverBulkStringNull: LeftoverDecoder<null> = Fn.flow(
	createDecoder(LeftoverBulkStringNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const decodeLeftoverBulkString: LeftoverDecoder<string> = Fn.flow(
	createDecoder(LeftoverBulkString),
	Effect.map(([, data]) => data),
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

type DecodeVerbatimString = LeftoverDecoder<Str.VerbatimString>;
const decodeLeftoverVerbatimString: DecodeVerbatimString = Fn.flow(
	createDecoder(LeftoverVerbatimString),
	Effect.map(([, data]) => data),
);

const decodeLeftoverInteger: LeftoverDecoder<Integer> =
	createDecoder(LeftoverInteger);

const decodeLeftoverDouble: LeftoverDecoder<number> =
	createDecoder(LeftoverDouble);
const decodeLeftoverBigNumber: LeftoverDecoder<bigint> =
	createDecoder(LeftoverBigNumber);

const decodeLeftoverBoolean: LeftoverDecoder<boolean> = Fn.flow(
	createDecoder(LeftoverBoolean),
	Effect.map(([, data, , leftover]) => ({ data, leftover })),
);

const decodeLeftoverPlainNull: LeftoverDecoder<null> = Fn.flow(
	createDecoder(LeftoverPlainNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);

const decodeLeftoverSimpleError: LeftoverDecoder<RespError> =
	createDecoder(LeftoverSimpleError);

const decodeLeftoverBulkError: LeftoverDecoder<RespError> =
	createDecoder(LeftoverBulkError);

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

type DecodeMap = LeftoverDecoder<RespMapValue>;
const decodeLeftoverMap: DecodeMap = decodeLeftoverMap_;

type DecodeSet = LeftoverDecoder<RespSetValue>;
const decodeLeftoverSet: DecodeSet = decodeLeftoverSet_;

const RespValueWithAttributeAST = namedAst("RespValueWithAttribute");
type DecodeAttribute = LeftoverDecoder<RespValue>;
const skipLeftoverAttribute: DecodeAttribute = function (input, ast) {
	return decodeLeftoverAttribute(input, ast).pipe(
		ParseResult.flatMap((value) =>
			decodeLeftoverValue(value.leftover, ast).pipe(
				ParseResult.mapError((issue) => {
					return new ParseResult.Composite(RespValueWithAttributeAST, input, [
						new ParseResult.Type(
							RespValueWithAttributeAST,
							input,
							`Received ${formatRespValue(value.data)} attribute`,
						),
						issue,
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

	if (HashMap.isHashMap(value)) {
		const items = Iterable.map(value, ([key, value]) => {
			return `${formatRespValue(key)} ~> ${formatRespValue(value)}`;
		});
		return `HashMap[${[...items].join(", ")}]`;
	}

	if (HashSet.isHashSet(value)) {
		const items = Iterable.map(value, formatRespValue);
		return `HashSet[${[...items].join(", ")}]`;
	}

	return String(value);
}
