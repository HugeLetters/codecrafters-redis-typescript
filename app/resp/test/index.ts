import { expect } from "bun:test";
import { ParseResult } from "effect";

export function expectParseError(value: unknown) {
	return expect(value).toBeInstanceOf(ParseResult.ParseError);
}
