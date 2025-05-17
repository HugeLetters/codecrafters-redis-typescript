import { green, red } from "$/utils/stdout";
import { normalize } from "$/utils/string";
import { ParseResult, Schema, SchemaAST, pipe } from "effect";

export namespace Log {
	export function bad(value: unknown) {
		return pipe(value, normalize, red);
	}

	export function good(value: unknown) {
		return pipe(value, normalize, green);
	}
}

export function namedAst(name: string) {
	return new SchemaAST.Literal("", {
		[SchemaAST.IdentifierAnnotationId]: name,
	});
}

export const decodeString = ParseResult.decodeUnknown(Schema.String);
