import { expect } from "bun:test";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { expectFail } from "$/test";

export function expectParseError(value: unknown) {
	return expect(value).toBeInstanceOf(ParseResult.ParseError);
}

expectParseError.withMessage = function (
	value: unknown,
	expectedMessagePart: string,
) {
	expect(value).toBeInstanceOf(ParseResult.ParseError);
	if (!ParseResult.isParseError(value)) {
		return Effect.void;
	}

	return Effect.gen(function* () {
		const message = yield* ParseResult.TreeFormatter.formatError(value);
		expect(Bun.stripANSI(message)).toContain(expectedMessagePart);
	});
};

export function createSchemaHelpers<A, I, R>(self: Schema.Schema<A, I, R>) {
	return {
		decode: Schema.decode(self),
		decodeFail: Fn.flow(Schema.decodeUnknown(self), expectFail),
		encode: Schema.encode(self),
		encodeFail: Fn.flow(Schema.encodeUnknown(self), expectFail),
	};
}
