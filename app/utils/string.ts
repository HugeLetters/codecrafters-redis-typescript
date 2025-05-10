export function normalize<T>(value: T) {
	if (typeof value !== "string") {
		return value;
	}

	const normalized = JSON.stringify(value);
	return normalized.slice(1, normalized.length - 1);
}
