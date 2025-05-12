import type { Integer } from "$/schema/number";
import type { Error_ } from "$/schema/resp/error";
import type { LeftoverData, LeftoverParseResult } from "$/schema/resp/leftover";
import { Number_ } from "$/schema/resp/number";
import { Primitive } from "$/schema/resp/primitive";
import { String_ } from "$/schema/resp/string";
import { Log } from "$/schema/utils";
import {
	Array as Arr,
	Effect,
	ParseResult,
	Schema,
	SchemaAST,
	flow,
} from "effect";
import { Array_, decodeLeftoverArray } from "./array";
import { ArrayPrefix } from "./prefix";

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
export const RespSchema = Schema.Union(
	...RespBasicSchema.members,
	Schema.suspend(() => Array_),
).pipe(Schema.annotations({ identifier: "RespValue" }));

export type RespPrimitiveValue = typeof RespBasicSchema.Type;

export type RespArrayType = ReadonlyArray<RespValue>;

type RespNonPrimitiveValue = RespArrayType;

export type RespValue = RespPrimitiveValue | RespNonPrimitiveValue;

export function decodeLeftoverItem(
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
	}

	const expected = Log.good("{resp_prefix}");
	const received = Log.bad(input);
	const message = `Expected string matching: ${expected}{content}{items}. Received ${received}`;
	const issue = new ParseResult.Type(ast, input, message);
	return ParseResult.fail(issue);
}

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
	createDecoder(String_.LeftoverSimpleString),
	Effect.map(([, data]) => data),
);

const decodeLeftoverBulkStringNull: LeftoverDecoder<null> = flow(
	createDecoder(Primitive.LeftoverBulkStringNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const decodeLeftoverBulkString: LeftoverDecoder<string> = flow(
	createDecoder(String_.LeftoverBulkString),
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
	createDecoder(String_.LeftoverVerbatimString),
	Effect.map(([, data]) => data),
);

type Int = typeof Integer.Type;
const decodeLeftoverInteger: LeftoverDecoder<Int> = createDecoder(
	Number_.LeftoverInteger,
);

const decodeLeftoverDouble: LeftoverDecoder<number> = createDecoder(
	Number_.LeftoverDouble,
);
const decodeLeftoverBigNumber: LeftoverDecoder<bigint> = createDecoder(
	Number_.LeftoverBigNumber,
);

const decodeLeftoverBoolean: LeftoverDecoder<boolean> = flow(
	createDecoder(Primitive.LeftoverBoolean),
	Effect.map(([, data, , leftover]) => ({ data, leftover })),
);

const decodeLeftoverPlainNull: LeftoverDecoder<null> = flow(
	createDecoder(Primitive.LeftoverPlainNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);

const decodeLeftoverSimpleError: LeftoverDecoder<Error_> = createDecoder(
	String_.LeftoverSimpleError,
);

const decodeLeftoverBulkError: LeftoverDecoder<Error_> = createDecoder(
	String_.LeftoverBulkError,
);

const decodeLeftoverArrayNull: LeftoverDecoder<null> = flow(
	createDecoder(Primitive.LeftoverArrayNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const LeftoverArrayValueAST = namedAst("LeftoverArrayValue");
type DecodeArrayValue = LeftoverDecoder<RespArrayType | null>;
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

export function namedAst(name: string) {
	return new SchemaAST.Literal("", {
		[SchemaAST.IdentifierAnnotationId]: name,
	});
}

export function serializeRespValue(value: RespValue): string {
	if (Arr.isArray<RespValue>(value)) {
		return `[${value.map(serializeRespValue).join(", ")}]`;
	}

	return String(value);
}
