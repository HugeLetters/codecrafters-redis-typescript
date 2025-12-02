import * as Fn from "effect/Function";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { Stdout } from "$/utils/stdout";
import { normalize } from "$/utils/string";

export namespace Color {
	export function bad(value: unknown) {
		return Fn.pipe(value, normalize, (v) => Stdout.colored("red", v));
	}

	export function good(value: unknown) {
		return Fn.pipe(value, normalize, Stdout.green);
	}
}

export function namedAst(name: string) {
	return new SchemaAST.Literal("", {
		[SchemaAST.IdentifierAnnotationId]: name,
	});
}

export const decodeString = ParseResult.decodeUnknown(Schema.String);
