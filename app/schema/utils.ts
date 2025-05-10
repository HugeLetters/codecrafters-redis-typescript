import { green, red } from "$/utils/stdout";
import { normalize } from "$/utils/string";
import { ParseResult, pipe } from "effect";
import type { AST } from "effect/SchemaAST";

export function parseTypeFail(ast: AST, actual: unknown, message: string) {
	const issue = new ParseResult.Type(ast, actual, message);
	return ParseResult.fail(issue);
}

export namespace Log {
	export function bad(value: unknown) {
		return pipe(value, normalize, red);
	}

	export function good(value: unknown) {
		return pipe(value, normalize, green);
	}
}
