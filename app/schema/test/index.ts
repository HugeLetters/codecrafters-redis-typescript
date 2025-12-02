import { expect } from "bun:test";
import * as Fn from "effect/Function";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";

import { expectFail } from "$/test";

export function expectParseError(value: unknown) {
	return expect(value).toBeInstanceOf(ParseResult.ParseError);
}

export function createSchemaHelpers<A, I, R>(self: Schema.Schema<A, I, R>) {
	return {
		decode: Schema.decode(self),
		decodeFail: Fn.flow(Schema.decodeUnknown(self), expectFail),
		encode: Schema.encode(self),
		encodeFail: Fn.flow(Schema.encodeUnknown(self), expectFail),
	};
}
