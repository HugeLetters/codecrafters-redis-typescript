import type { Integer } from "$/schema/number";
import type { Error_ } from "$/schema/resp/error";
import type { LeftoverParseResult } from "$/schema/resp/leftover";
import { Number_ } from "$/schema/resp/number";
import { Primitive } from "$/schema/resp/primitive";
import { String_ } from "$/schema/resp/string";
import type { VerbatimString } from "$/schema/resp/string/verbatim";
import { Log, parseTypeFail } from "$/schema/utils";
import type { EffectGen } from "$/utils/effect";
import { Effect, ParseResult, Schema, type SchemaAST, flow } from "effect";
import { ArrayPrefix, Array_, decodeLeftoverArray } from "./array";

const RespBasicSchema = Schema.Union(
	String_.String,
	String_.VerbatimString,

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

export type RespData = typeof RespBasicSchema.Type | ReadonlyArray<RespData>;

export const decodeLeftoverItem = Effect.fn(function* (
	input: string,
	ast: SchemaAST.AST,
): EffectGen<LeftoverParseResult<RespData>> {
	const prefix = input[0];
	switch (prefix) {
		case String_.SimpleStringPrefix: {
			return yield* decodeLeftoverSimpleString(input);
		}
		case String_.BulkStringPrefix: {
			return yield* decodeLeftoverBulkValue(input);
		}
		case String_.VerbatimStringPrefix: {
			return yield* decodeLeftoverVerbatimString(input);
		}
		case Number_.IntegerPrefix: {
			return yield* decodeLeftoverInteger(input);
		}
		case Number_.DoublePrefix: {
			return yield* decodeLeftoverDouble(input);
		}
		case Number_.BigNumberPrefix: {
			return yield* decodeLeftoverBigNumber(input);
		}
		case Primitive.BooleanPrefix: {
			return yield* decodeLeftoverBoolean(input);
		}
		case Primitive.NullPrefix: {
			return yield* decodeLeftoverPlainNull(input);
		}
		case String_.SimpleErrorPrefix: {
			return yield* decodeLeftoverSimpleError(input);
		}
		case String_.BulkErrorPrefix: {
			return yield* decodeLeftoverBulkError(input);
		}
		case ArrayPrefix: {
			return yield* decodeLeftoverArrayValue(input, ast);
		}
	}

	const expected = Log.good("{resp_prefix}");
	const received = Log.bad(input);
	const message = `Expected string matching: ${expected}{content}{items}. Received ${received}`;
	return yield* parseTypeFail(ast, input, message);
});

type LeftoverDecoder<T> = (value: string) => LeftoverParseResult<T>;

const decodeLeftoverSimpleString: LeftoverDecoder<string> = flow(
	ParseResult.decodeUnknown(String_.LeftoverSimpleString),
	Effect.map(([, data]) => data),
);

const decodeLeftoverBulkStringNull: LeftoverDecoder<null> = flow(
	ParseResult.decodeUnknown(Primitive.LeftoverBulkStringNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);
const decodeLeftoverBulkString: LeftoverDecoder<string> = flow(
	ParseResult.decodeUnknown(String_.LeftoverBulkString),
	Effect.map(([, data]) => data),
);
function decodeLeftoverBulkValue(value: string) {
	return decodeLeftoverBulkStringNull(value).pipe(
		Effect.orElse(() => decodeLeftoverBulkString(value)),
	);
}

const decodeLeftoverVerbatimString: LeftoverDecoder<VerbatimString> = flow(
	ParseResult.decodeUnknown(String_.LeftoverVerbatimString),
	Effect.map(([, data]) => data),
);

const decodeLeftoverInteger: LeftoverDecoder<typeof Integer.Type> =
	ParseResult.decodeUnknown(Number_.LeftoverInteger);

const decodeLeftoverDouble: LeftoverDecoder<number> = ParseResult.decodeUnknown(
	Number_.LeftoverDouble,
);
const decodeLeftoverBigNumber: LeftoverDecoder<bigint> =
	ParseResult.decodeUnknown(Number_.LeftoverBigNumber);

const decodeLeftoverBoolean: LeftoverDecoder<boolean> = flow(
	ParseResult.decodeUnknown(Primitive.LeftoverBoolean),
	Effect.map(([, data, , leftover]) => ({ data, leftover })),
);

const decodeLeftoverPlainNull: LeftoverDecoder<null> = flow(
	ParseResult.decodeUnknown(Primitive.LeftoverPlainNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);

const decodeLeftoverSimpleError: LeftoverDecoder<Error_> =
	ParseResult.decodeUnknown(String_.LeftoverSimpleError);

const decodeLeftoverBulkError: LeftoverDecoder<Error_> =
	ParseResult.decodeUnknown(String_.LeftoverBulkError);

const decodeLeftoverArrayNull: LeftoverDecoder<null> = flow(
	ParseResult.decodeUnknown(Primitive.LeftoverArrayNull),
	Effect.map(([data, leftover]) => ({ data, leftover })),
);

function decodeLeftoverArrayValue(input: string, ast: SchemaAST.AST) {
	return decodeLeftoverArrayNull(input).pipe(
		Effect.orElse(() => decodeLeftoverArray(input, ast)),
	);
}
