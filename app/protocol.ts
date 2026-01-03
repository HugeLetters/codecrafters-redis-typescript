import { regex } from "arkregex";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as EffSchema from "effect/Schema";
import * as Str from "effect/String";
import { Resp } from "$/resp";
import { CR, CRLF, LF } from "./resp/constants";

export namespace Protocol {
	const Schema = Resp.V2.RespValue;
	type Schema = typeof Schema;

	export const decode = EffSchema.decode(Schema);

	export function decodeBuffer(buffer: Buffer) {
		return decode(buffer.toString("utf-8"));
	}

	export function encode(value: Value) {
		if (value instanceof Boxed) {
			return EffSchema.encode(value.schema)(value.value);
		}

		return EffSchema.encode(Schema)(value);
	}

	/** Values which can be received as a result of decoding */
	export type Decoded = Schema["Type"];
	/** Values which can be passed in to encoding/formatting */
	export type Value = Decoded | Boxed;
	/** Values which can be received as a result of encoding */
	export type Encoded = Schema["Encoded"];

	const stripForbidden = Str.replaceAll(
		regex(`(?:${CRLF})|(?:${CR})|(?:${LF})`, "g"),
		" ",
	);
	export function fail(message: string) {
		// since we're using Resp2 - that means this will be encoded as a simple error - which means no \r\n allowed
		const stripped = stripForbidden(message);
		return new Resp.Error({ message: stripped });
	}
	export type Error = ReturnType<typeof fail>;

	export function format(value: Value): string {
		return Resp.V2.format(value instanceof Boxed ? value.value : value);
	}

	class Boxed<
		T extends Decoded = Decoded,
		E extends Encoded = Encoded,
	> extends Data.TaggedClass("Boxed")<{
		readonly value: T;
		readonly schema: EffSchema.Schema<T, E>;
	}> {}

	/** Allows forcing a value to be encoded with the specified schema */
	export function boxed<T extends Decoded, E extends Encoded>(
		value: T,
		schema: EffSchema.Schema<T, E>,
	) {
		return new Boxed<Decoded, Encoded>({ value, schema: schema as never });
	}

	export function simple(value: string) {
		return boxed(
			value,
			EffSchema.Union(Resp.V2.String.SimpleString, Resp.V2.String.BulkString),
		);
	}

	export function config(config: Resp.Config["Type"]) {
		return Effect.provideService(Resp.Config, config);
	}
}
