import { Error_ } from "$/schema/resp/error";
import { Effect, ParseResult, Schema } from "effect";
import { BulkError, BulkString } from "./bulk";
import { SimpleError, SimpleString } from "./simple";

export const String_ = Schema.declare(
	[SimpleString, BulkString],
	{
		decode(simple, bulk) {
			const decode = ParseResult.decodeUnknown(Schema.Union(simple, bulk));
			return function (input, opts) {
				return decode(input, opts);
			};
		},
		encode(simple, bulk) {
			const encodeSimple = ParseResult.encode(simple);
			const encodeBulk = ParseResult.encode(bulk);
			return Effect.fn(function* (input, opts) {
				const str = yield* ParseResult.decodeUnknown(Schema.String)(input);
				if (str.length < 10) {
					return yield* encodeSimple(str, opts);
				}

				return yield* encodeBulk(str, opts);
			});
		},
	},
	{ identifier: "RespString" },
);

export const ErrorFromString = Schema.declare(
	[SimpleError, BulkError],
	{
		decode(simple, bulk) {
			const decode = ParseResult.decodeUnknown(Schema.Union(simple, bulk));
			return function (input, opts) {
				return decode(input, opts);
			};
		},
		encode(simple, bulk) {
			const encodeSimple = ParseResult.encode(simple);
			const encodeBulk = ParseResult.encode(bulk);
			return Effect.fn(function* (input, opts) {
				const str = yield* ParseResult.decodeUnknown(Error_)(input);
				if (str.message.length < 10) {
					return yield* encodeSimple(str, opts);
				}

				return yield* encodeBulk(str, opts);
			});
		},
	},
	{ identifier: "RespStringError" },
);
