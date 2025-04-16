import { expectFail } from "$/test";
import { expect } from "bun:test";
import { flow, ParseResult, Schema } from "effect";

export function expectParseError(value: unknown) {
	return expect(value).toBeInstanceOf(ParseResult.ParseError);
}

export function createSchemaHelpers<A, I, R>(self: Schema.Schema<A, I, R>) {
	return {
		decode: Schema.decode(self),
		decodeFail: flow(Schema.decodeUnknown(self), expectFail),
		encode: Schema.encode(self),
		encodeFail: flow(Schema.encodeUnknown(self), expectFail),
	};
}
