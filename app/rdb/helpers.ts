import * as Arr from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as HashMap from "effect/HashMap";
import * as Iterable from "effect/Iterable";
import type {
	Database,
	DatabaseEntries,
	RDBFile,
	Value,
	ValueWithMeta,
} from "./type";

export function format(file: RDBFile) {
	const version = `Version: ${file.version}`;

	const metaPrefix = `Aux: `;
	const metaEntryOffset = " ".repeat(metaPrefix.length);
	const meta = file.meta.pipe(
		HashMap.entries,
		Iterable.map(([key, value], i) => {
			const entry = `${key} ~> ${value}`;
			return i === 0 ? entry : `${metaEntryOffset}${entry}`;
		}),
		Arr.join("\n"),
	);

	const dbs = file.databases.pipe(
		HashMap.entries,
		Iterable.map(([key, db]) => {
			const prefix = `DB ${key}: `;
			return `${prefix}${formatDB(db, " ".repeat(prefix.length))}`;
		}),
		Arr.join("\n"),
	);

	return `${version}\n${metaPrefix}${meta}\n${dbs}`;
}

function formatDB(db: Database, prefix: string) {
	if (db.meta) {
		return `Size ${db.meta.hashSize}. Expire Size ${db.meta.expireHashSize}.\n${formatDBEntries(db.entries, prefix)}`;
	}

	return `\n${formatDBEntries(db.entries, prefix)}`;
}
function formatDBEntries(entries: DatabaseEntries, prefix: string) {
	return entries.pipe(
		HashMap.entries,
		Iterable.map(([key, value]) => {
			return `${prefix}${key} ~> ${formatDBValueWithMeta(value)}`;
		}),
		Arr.join("\n"),
	);
}

function formatDBValueWithMeta(value: ValueWithMeta) {
	if (value.expiry) {
		return `Expires at ${DateTime.format(value.expiry)}. ${formatValue(value.value)}`;
	}

	return formatValue(value.value);
}

function formatValue(value: Value) {
	return value.toString();
}
