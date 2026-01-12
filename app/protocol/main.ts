import { regex } from "arkregex";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as SchemaM from "effect/Schema";
import * as Str from "effect/String";
import { Resp } from "$/resp";
import { namedAst } from "$/schema/utils";

const Schema = Resp.V2.RespValue;
type Schema = typeof Schema;

class Boxed<T extends Decoded = Decoded> extends Data.TaggedClass("Boxed")<{
	readonly value: T;
	readonly schema: SchemaM.Schema<Decoded, string>;
}> {}

export function bufferToString(buffer: Buffer) {
	return buffer.toString("utf-8");
}

export const decode = SchemaM.decode(Schema);
export function decodeBuffer(buffer: Buffer) {
	return decode(bufferToString(buffer));
}

const AST = namedAst("Protocol");
export const createDecodePull = function (value: string) {
	let encoded = value;

	return Effect.gen(function* () {
		if (encoded.length === 0) {
			return Option.none();
		}

		const decoded = yield* Resp.V2.decodeLeftover(encoded, AST).pipe(
			Effect.mapError((issue) => new ParseResult.ParseError({ issue })),
		);
		encoded = decoded.leftover;
		return Option.some(decoded.data);
	});
};

export const encode = Match.type<Value>().pipe(
	Match.when(Match.instanceOfUnsafe(Boxed), (boxed) =>
		SchemaM.encode(boxed.schema)(boxed.value),
	),
	Match.orElse(SchemaM.encode(Schema)),
);

/** Values which can be received as a result of decoding */
export type Decoded = Schema["Type"];
/** Values which can be passed in to encoding/formatting */
export type Value<V extends Decoded = Decoded> = V | Boxed<V>;
/** Values which can be received as a result of encoding */
export type Encoded = Schema["Encoded"];

const stripForbidden = Str.replaceAll(
	regex(`(?:${Resp.CRLF})|(?:${Resp.CR})|(?:${Resp.LF})`, "g"),
	" ",
);
export function fail(message: string) {
	// since we're using Resp2 - that means this will be encoded as a simple error - which means no \r\n allowed
	const stripped = stripForbidden(message);
	return new Resp.Error({ message: stripped });
}
export type Error = ReturnType<typeof fail>;
export const isError = SchemaM.is(Resp.Error);

const getRespValue = Match.type<Value>().pipe(
	Match.withReturnType<Decoded>(),
	Match.when(Match.instanceOfUnsafe(Boxed), (boxed) => boxed.value),
	Match.orElse((value) => value),
);
export function format(value: Value): string {
	return Resp.V2.format(getRespValue(value));
}

/** Allows forcing a value to be encoded with the specified schema */
export function boxed<T extends Decoded, E extends Encoded>(
	value: T,
	schema: SchemaM.Schema<T, E>,
) {
	return new Boxed({ value, schema: schema as never });
}

/** Will always try to encode as simple string first and only if it fails fallback to bulk string */
export function simple<T extends string>(value: T) {
	return boxed(
		value,
		SchemaM.Union(
			Resp.V2.String.SimpleString,
			Resp.V2.String.BulkString,
		) as never,
	);
}

export function config(config: Resp.Config["Type"]) {
	return Effect.provideService(Resp.Config, config);
}

export type { Boxed };
