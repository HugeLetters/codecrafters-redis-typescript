import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Random from "effect/Random";

export const LetterAlphabet = pipe(Arr.range(97, 97 + 25), (x) =>
	String.fromCharCode(...x),
);
export const NumberAlphabet = pipe(Arr.range(48, 48 + 9), (x) =>
	String.fromCharCode(...x),
);
export const AlphanumericAlphabet = `${LetterAlphabet}${NumberAlphabet}`;

export const randomString = Effect.fn(function* (
	alphabet: string,
	length: number,
) {
	let result = "";

	for (let i = 0; i < length; i++) {
		const int = yield* Random.nextIntBetween(0, alphabet.length);
		result += alphabet[int];
	}

	return result;
});
