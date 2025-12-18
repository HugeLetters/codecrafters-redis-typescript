import * as BigInteger from "effect/BigInt";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";

interface Concatable<T> {
	readonly reduce: <U>(
		run: (acc: U, value: T, index: number) => U,
		initial: U,
	) => U;
	readonly length: number;
}

export function concatInteger(arr: Concatable<number>) {
	return arr.reduce(
		(acc, value, i) =>
			acc + (BigInt(value) << BigInt(8 * (arr.length - i - 1))),
		0n,
	);
}

export function concatUint8AsNumber(arr: Concatable<number>) {
	return pipe(concatInteger(arr), BigInteger.toNumber, Option.getOrNull);
}
