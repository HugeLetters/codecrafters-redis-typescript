import { CRLF } from "$/schema/resp/constants";
import {
	ArrayPrefix,
	MapPrefix,
	SetPrefix,
} from "$/schema/resp/container/prefix";
import { IntegerPrefix } from "$/schema/resp/number/integer";
import { NullPrefix } from "$/schema/resp/primitive/null";
import { BulkStringPrefix } from "$/schema/resp/string/bulk";
import {
	SimpleErrorPrefix,
	SimpleStringPrefix,
} from "$/schema/resp/string/simple";
import { HashMap, HashSet } from "effect";

export function arr(arr: ReadonlyArray<string>) {
	return `${ArrayPrefix}${arr.length}${CRLF}${arr.join("")}`;
}

export function respmap(entries: ReadonlyArray<[string, string]>) {
	return `${MapPrefix}${entries.length}${CRLF}${entries.map(([k, v]) => k + v).join("")}`;
}
export function respset(entries: ReadonlyArray<string>) {
	const set = new Set(entries);
	return `${SetPrefix}${set.size}${CRLF}${[...set].join("")}`;
}

export const hashmap = HashMap.fromIterable;
export const hashset = HashSet.fromIterable;

export function bulk(s: string) {
	return `${BulkStringPrefix}${s.length}${CRLF}${s}${CRLF}`;
}

export function int(n: number) {
	return `${IntegerPrefix}${n}${CRLF}`;
}

export function simple(s: string) {
	return `${SimpleStringPrefix}${s}${CRLF}`;
}

export function err(s: string) {
	return `${SimpleErrorPrefix}${s}${CRLF}`;
}

export const null_ = `${NullPrefix}${CRLF}`;
