import type { Integer } from "$/schema/number";
import { Log, decodeString, namedAst } from "$/schema/utils";
import {
	Array as Arr,
	Effect,
	HashMap,
	HashSet,
	Iterable,
	ParseResult,
	Schema,
	type SchemaAST,
	flow,
	identity,
} from "effect";
import { Array_, decodeLeftoverArray } from "./container/array";
import { decodeLeftoverAttribute } from "./container/attribute";
import { Map_, decodeLeftoverMap as decodeLeftoverMap_ } from "./container/map";
import {
	ArrayPrefix,
	AttributePrefix,
	MapPrefix,
	SetPrefix,
} from "./container/prefix";
import { Set_, decodeLeftoverSet as decodeLeftoverSet_ } from "./container/set";
import type { Error_ } from "./error";
import {
	type LeftoverData,
	type LeftoverParseResult,
	noLeftover,
} from "./leftover";
import { Number_ } from "./number";
import { LeftoverBigNumber } from "./number/bigNumber";
import { LeftoverDouble } from "./number/double";
import { LeftoverInteger } from "./number/integer";
import { Primitive } from "./primitive";
import { LeftoverBoolean } from "./primitive/boolean";
import {
	LeftoverArrayNull,
	LeftoverBulkStringNull,
	LeftoverPlainNull,
} from "./primitive/null";
import { String_ } from "./string";
import { LeftoverBulkError, LeftoverBulkString } from "./string/bulk";
import { LeftoverSimpleError, LeftoverSimpleString } from "./string/simple";
import { LeftoverVerbatimString } from "./string/verbatim";

export function decodeLeftoverValue(
	input: string,
	ast: SchemaAST.AST,
): LeftoverParseResult<RespValue> {
	const prefix = input[0];
	switch (prefix) {
		case String_.SimpleStringPrefix: {
			return decodeLeftoverSimpleString(input, ast);
		}
		case String_.BulkStringPrefix: {
			return decodeLeftoverBulkValue(input, ast);
		}
		case String_.VerbatimStringPrefix: {
			return decodeLeftoverVerbatimString(input, ast);
		}
		case Number_.IntegerPrefix: {
			return decodeLeftoverInteger(input, ast);
		}
		case Number_.DoublePrefix: {
			return decodeLeftoverDouble(input, ast);
		}
		case Number_.BigNumberPrefix: {
			return decodeLeftoverBigNumber(input, ast);
		}
		case Primitive.BooleanPrefix: {
			return decodeLeftoverBoolean(input, ast);
		}
		case Primitive.NullPrefix: {
			return decodeLeftoverPlainNull(input, ast);
		}
		case String_.SimpleErrorPrefix: {
			return decodeLeftoverSimpleError(input, ast);
		}
		case String_.BulkErrorPrefix: {
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

	const expected = Log.good("{resp_prefix}");
	const received = Log.bad(input);
	const message = `Expected string matching: ${expected}{content}{items}. Received ${received}`;
	const issue = new ParseResult.Type(ast, input, message);
	return ParseResult.fail(issue);
}

const RespBasicSchema = Schema.Union(
	String_.String,
	String_.VerbatimStringFromString,

	Number_.Integer,
	Number_.Double,
	Number_.BigNumber,

	Primitive.PlainNull,
	Primitive.Boolean,

	String_.ErrorFromString,
);

/** For encoding only */
const RespSchema = Schema.Union(
	...RespBasicSchema.members,
	Schema.suspend(() => Array_),
	Schema.suspend(() => Map_),
	Schema.suspend(() => Set_),
).pipe(Schema.annotations({ identifier: "RespValue" }));

const NoLeftover = Schema.String.pipe(noLeftover(identity, "RespValue"));
const validateNoLeftover = ParseResult.validate(NoLeftover);
export const RespValue = Schema.declare(
	[RespSchema],
	{
		decode() {
			return Effect.fn(function* (input, _opts, ast) {
				const str = yield* decodeString(input);
				const data = yield* decodeLeftoverValue(str, ast);
				yield* validateNoLeftover(data.leftover);
				return data.data;
			});
		},
		encode(schema) {
			const encode = ParseResult.encodeUnknown(schema);
			return function (input, opt) {
				return encode(input, opt);
			};
		},
	},
	{ identifier: "RespValue" },
);

export type RespPrimitiveValue = typeof RespBasicSchema.Type;

export type RespArrayValue = ReadonlyArray<RespValue>;

export type RespMapValue = HashMap.HashMap<RespHashableValue, RespValue>;
export type RespSetValue = HashSet.HashSet<RespHashableValue>;

export type RespHashableValue =
	| RespPrimitiveValue
	| RespMapValue
	| RespSetValue;

export type RespValue = RespHashableValue | RespArrayValue;

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

const decodeLeftoverSimpleString: LeftoverDecoder<string> = flow(
	createDecoder(LeftoverSimpleString),
	Effect.map(([, data]) => data),
);

const decodeLeftoverBulkStringNull: LeftoverDecoder<null> = flow(
	createDecoder(LeftoverBulkStringNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const decodeLeftoverBulkString: LeftoverDecoder<string> = flow(
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

type DecodeVerbatimString = LeftoverDecoder<String_.VerbatimString>;
const decodeLeftoverVerbatimString: DecodeVerbatimString = flow(
	createDecoder(LeftoverVerbatimString),
	Effect.map(([, data]) => data),
);

type Int = typeof Integer.Type;
const decodeLeftoverInteger: LeftoverDecoder<Int> =
	createDecoder(LeftoverInteger);

const decodeLeftoverDouble: LeftoverDecoder<number> =
	createDecoder(LeftoverDouble);
const decodeLeftoverBigNumber: LeftoverDecoder<bigint> =
	createDecoder(LeftoverBigNumber);

const decodeLeftoverBoolean: LeftoverDecoder<boolean> = flow(
	createDecoder(LeftoverBoolean),
	Effect.map(([, data, , leftover]) => ({ data, leftover })),
);

const decodeLeftoverPlainNull: LeftoverDecoder<null> = flow(
	createDecoder(LeftoverPlainNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);

const decodeLeftoverSimpleError: LeftoverDecoder<Error_> =
	createDecoder(LeftoverSimpleError);

const decodeLeftoverBulkError: LeftoverDecoder<Error_> =
	createDecoder(LeftoverBulkError);

const decodeLeftoverArrayNull: LeftoverDecoder<null> = flow(
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
				Effect.mapError((issue) => {
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
