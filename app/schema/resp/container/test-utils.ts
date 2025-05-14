import { CRLF } from "$/schema/resp/constants";
import { IntegerPrefix } from "$/schema/resp/number/integer";
import { NullPrefix } from "$/schema/resp/primitive/null";
import { BulkStringPrefix } from "$/schema/resp/string/bulk";
import {
	SimpleErrorPrefix,
	SimpleStringPrefix,
} from "$/schema/resp/string/simple";
import { HashMap } from "effect";
import { MapPrefix } from "./map";
import { ArrayPrefix } from "./prefix";

export function arr(arr: Array<string>) {
	return `${ArrayPrefix}${arr.length}${CRLF}${arr.join("")}`;
}

export function respmap(entries: Array<[string, string]>) {
	return `${MapPrefix}${entries.length}${CRLF}${entries.map(([k, v]) => k + v).join("")}`;
}
export const hashmap = HashMap.fromIterable;

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
