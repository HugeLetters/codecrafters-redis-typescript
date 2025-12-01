import { ParseResult, pipe, Schema, SchemaAST } from "effect";
import { Stdout } from "$/utils/stdout";
import { normalize } from "$/utils/string";

export namespace Color {
	export function bad(value: unknown) {
		return pipe(value, normalize, (v) => Stdout.colored("red", v));
	}

	export function good(value: unknown) {
		return pipe(value, normalize, Stdout.green);
	}
}

export function namedAst(name: string) {
	return new SchemaAST.Literal("", {
		[SchemaAST.IdentifierAnnotationId]: name,
	});
}

export const decodeString = ParseResult.decodeUnknown(Schema.String);
