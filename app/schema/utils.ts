import { green, red } from "$/utils/stdout";
import { ParseResult, pipe } from "effect";
import type { AST } from "effect/SchemaAST";

export function parseTypeFail(ast: AST, actual: unknown, message: string) {
	const issue = new ParseResult.Type(ast, actual, message);
	return ParseResult.fail(issue);
}

export namespace Log {
	export function received(value: unknown) {
		return pipe(value, normalize, red);
	}

	export function expected(value: unknown) {
		return pipe(value, normalize, green);
	}

	function normalize(value: unknown) {
		if (typeof value !== "string") {
			return value;
		}

		const normalized = JSON.stringify(value);
		return normalized.slice(1, normalized.length - 1);
	}
}
