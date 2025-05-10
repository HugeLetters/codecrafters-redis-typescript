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
			const decodeString = ParseResult.decodeUnknown(Schema.String);
			return Effect.fn(function* (input, opts) {
				const str = yield* decodeString(input);
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
			const decodeError = ParseResult.decodeUnknown(Error_);
			return Effect.fn(function* (input, opts) {
				const err = yield* decodeError(input);
				if (err.message.length < 10) {
					return yield* encodeSimple(err, opts);
				}

				return yield* encodeBulk(err, opts);
			});
		},
	},
	{ identifier: "RespStringError" },
);
