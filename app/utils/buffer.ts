import * as BigInteger from "effect/BigInt";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";

export function concatUint8(arr: Uint8Array) {
	return arr.reduce(
		(acc, value, i) =>
			acc + (BigInt(value) << BigInt(8 * (arr.length - i - 1))),
		0n,
	);
}

export function concatUint8AsNumber(arr: Uint8Array) {
	return pipe(concatUint8(arr), BigInteger.toNumber, Option.getOrNull);
}
