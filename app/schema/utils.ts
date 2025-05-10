import { green, red } from "$/utils/stdout";
import { normalize } from "$/utils/string";
import { pipe } from "effect";

export namespace Log {
	export function bad(value: unknown) {
		return pipe(value, normalize, red);
	}

	export function good(value: unknown) {
		return pipe(value, normalize, green);
	}
}
