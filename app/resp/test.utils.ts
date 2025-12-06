import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import { ArrayPrefix, CRLF } from "./constants";
import { IntegerPrefix } from "./v2/integer";
import { Str } from "./v2/string";
import { AttributePrefix, MapPrefix, SetPrefix } from "./v3/container/prefix";
import { Primitive } from "./v3/primitive";

export function simple(s: string) {
	return `${Str.SimpleStringPrefix}${s}${CRLF}`;
}

export function bulk(s: string) {
	return `${Str.BulkStringPrefix}${s.length}${CRLF}${s}${CRLF}`;
}

export function int(n: number) {
	return `${IntegerPrefix}${n}${CRLF}`;
}

export function err(s: string) {
	return `${Str.SimpleErrorPrefix}${s}${CRLF}`;
}

export const null_ = `${Primitive.NullPrefix}${CRLF}`;
export const bulknull = `${Str.BulkStringPrefix}-1${CRLF}`;

export function arr(arr: ReadonlyArray<string>) {
	return `${ArrayPrefix}${arr.length}${CRLF}${arr.join("")}`;
}

export function respmap(entries: ReadonlyArray<[string, string]>) {
	return `${MapPrefix}${entries.length}${CRLF}${pipe(
		entries,
		Arr.map(([k, v]) => `${k}${v}`),
		Arr.join(""),
	)}`;
}
export function respset(entries: ReadonlyArray<string>) {
	const set = new Set(entries);
	return `${SetPrefix}${set.size}${CRLF}${Arr.join(set, "")}`;
}

export function attr(entries: Array<[string, string]>) {
	return `${AttributePrefix}${entries.length}${CRLF}${entries.map(([k, v]) => k + v).join("")}`;
}

export const hashmap = HashMap.fromIterable;
export const hashset = HashSet.fromIterable;

export const RawCR = String.raw`\r`;
export const RawLF = String.raw`\n`;
export const RawCRLF = `${RawCR}${RawLF}`;
