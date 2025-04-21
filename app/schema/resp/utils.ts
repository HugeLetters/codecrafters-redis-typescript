import { ParseResult } from "effect";
import type { AST } from "effect/SchemaAST";

export function parseFail(ast: AST, actual: unknown, message: string) {
	const issue = new ParseResult.Type(ast, actual, message);
	return ParseResult.fail(issue);
}
