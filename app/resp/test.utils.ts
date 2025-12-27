import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import { ArrayPrefix, CRLF } from "./constants";
import { V2 } from "./v2";
import { V3 } from "./v3";

export function simple(s: string) {
	return `${V2.String.SimpleStringPrefix}${s}${CRLF}`;
}

export function bulk(s: string) {
	return `${V2.String.BulkStringPrefix}${s.length}${CRLF}${s}${CRLF}`;
}

export function int(n: number) {
	return `${V2.IntegerPrefix}${n}${CRLF}`;
}

export function err(s: string) {
	return `${V2.String.SimpleErrorPrefix}${s}${CRLF}`;
}
export function bulkerr(s: string) {
	return `${V3.String.BulkErrorPrefix}${s.length}${CRLF}${s}${CRLF}`;
}

export const null_ = `${V3.Primitive.NullPrefix}${CRLF}`;
export const bulknull = `${V2.String.BulkStringPrefix}-1${CRLF}`;

export function arr(arr: ReadonlyArray<string>) {
	return `${ArrayPrefix}${arr.length}${CRLF}${arr.join("")}`;
}

export function respmap(entries: ReadonlyArray<[string, string]>) {
	return `${V3.MapPrefix}${entries.length}${CRLF}${pipe(
		entries,
		Arr.map(([k, v]) => `${k}${v}`),
		Arr.join(""),
	)}`;
}
export function respset(entries: ReadonlyArray<string>) {
	const set = new Set(entries);
	return `${V3.SetPrefix}${set.size}${CRLF}${Arr.join(set, "")}`;
}

export function attr(entries: Array<[string, string]>) {
	return `${V3.AttributePrefix}${entries.length}${CRLF}${entries.map(([k, v]) => k + v).join("")}`;
}

export const hashmap = HashMap.fromIterable;
export const hashset = HashSet.fromIterable;

export const RawCR = String.raw`\r`;
export const RawLF = String.raw`\n`;
export const RawCRLF = `${RawCR}${RawLF}`;
