import { regex } from "arkregex";
import * as EffSchema from "effect/Schema";
import * as Str from "effect/String";
import { Resp } from "$/resp";
import { CR, CRLF, LF } from "./resp/constants";

export namespace Protocol {
	const Schema = Resp.V2.RespValue;
	type Schema = typeof Schema;

	export const decode = EffSchema.decode(Schema);
	export const encode = EffSchema.encode(Schema);

	export type Decoded = Schema["Type"];
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

	export function format(value: Decoded): string {
		return Resp.V2.format(value);
	}
}
