/**
 * vendored from https://github.com/McSimp/lzfjs
 */

/** biome-ignore-all lint/style/noNonNullAssertion: its a port */
import * as Option from "effect/Option";

export namespace LZF {
	export function decompress(data: ArrayBuffer | Buffer) {
		const input = new Uint8Array(data);
		const output: number[] = [];

		let ip = 0;
		let op = 0;

		do {
			let ctrl = input[ip++]!;

			if (ctrl < 1 << 5) {
				/* literal run */
				ctrl++;

				if (ip + ctrl > input.length) {
					return Option.none();
				}

				while (ctrl--) {
					output[op++] = input[ip++]!;
				}
			} else {
				/* back reference */
				let len = ctrl >> 5;
				let ref = op - ((ctrl & 0x1f) << 8) - 1;

				if (ip >= input.length) {
					return Option.none();
				}

				if (len === 7) {
					len += input[ip++]!;

					if (ip >= input.length) {
						return Option.none();
					}
				}

				ref -= input[ip++]!;

				if (ref < 0) {
					return Option.none();
				}

				len += 2;

				do {
					output[op++] = output[ref++]!;
				} while (--len);
			}
		} while (ip < input.length);

		return Option.some(Buffer.from(output));
	}

	const HLOG = 16;
	const HSIZE = 1 << HLOG;
	const LZF_MAX_OFF = 1 << 13;
	const LZF_MAX_REF = (1 << 8) + (1 << 3);
	const LZF_MAX_LIT = 1 << 5;

	function FRST(data: Uint8Array, p: number) {
		return (data[p]! << 8) | data[p + 1]!;
	}

	function NEXT(v: number, data: Uint8Array | Buffer, p: number) {
		return (v << 8) | data[p + 2]!;
	}

	function IDX(h: number) {
		return ((h * 0x1e35a7bd) >> (32 - HLOG - 8)) & (HSIZE - 1);
	}

	export function compress(data: Buffer) {
		const input = new Uint8Array(data);
		const output: number[] = [];
		const htab = new Uint32Array(HSIZE);
		const in_end = input.length;

		let ip = 0;
		let hval = FRST(input, ip);
		let op = 1;
		let lit = 0; /* start run */

		while (ip < in_end - 2) {
			hval = NEXT(hval, data, ip);
			const hslot = IDX(hval);
			const ref = htab[hslot]!;
			htab[hslot] = ip;

			let off: number | undefined;

			if (
				/* the next test will actually take care of this, but this is faster */
				ref < ip &&
				// biome-ignore lint/suspicious/noAssignInExpressions: fast
				(off = ip - ref - 1) < LZF_MAX_OFF &&
				ref > 0 &&
				input[ref + 2] === input[ip + 2] &&
				input[ref + 1] === input[ip + 1] &&
				input[ref] === input[ip]
			) {
				/* match found at *ref++ */
				let len = 2;
				const maxlen = Math.min(in_end - ip - len, LZF_MAX_REF);

				output[op - lit - 1] = (lit - 1) & 255; /* stop run */
				if (lit === 0) {
					op -= 1; /* undo run if length is zero */
				}

				do {
					len++;
				} while (len < maxlen && input[ref + len] === input[ip + len]);

				len -= 2; /* len is now #octets - 1 */
				ip++;

				if (len < 7) {
					output[op++] = ((off >> 8) + (len << 5)) & 255;
				} else {
					output[op++] = ((off >> 8) + (7 << 5)) & 255;
					output[op++] = (len - 7) & 255;
				}

				output[op++] = off & 255;

				lit = 0;
				op++; /* start run */

				ip += len + 1;

				if (ip >= in_end - 2) {
					break;
				}

				--ip;
				--ip;
				hval = FRST(input, ip);

				hval = NEXT(hval, input, ip);
				htab[IDX(hval)] = ip++;

				hval = NEXT(hval, input, ip);
				htab[IDX(hval)] = ip++;
			} else {
				lit++;
				output[op++] = input[ip++]!;

				if (lit === LZF_MAX_LIT) {
					output[op - lit - 1] = (lit - 1) & 255; /* stop run */
					lit = 0;
					op++; /* start run */
				}
			}
		}

		while (ip < in_end) {
			lit++;
			output[op++] = input[ip++]!;

			if (lit === LZF_MAX_LIT) {
				output[op - lit - 1] = (lit - 1) & 255; /* stop run */
				lit = 0;
				op++; /* start run */
			}
		}

		if (lit !== 0) {
			output[op - lit - 1] = (lit - 1) & 255; /* stop run */
		}

		return Buffer.from(output);
	}
}
