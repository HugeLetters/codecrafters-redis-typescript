import { flow } from "effect";

export const toOptimalExponential = flow(
	(x: number) => x.toExponential(),
	(x) => {
		const [base, exponent] = x.split("e");
		if (!base || !exponent) {
			return x;
		}

		const [int, fraction = ""] = base.split(".");
		const newExponent = Number.parseInt(exponent, 10) - fraction.length;
		return `${int}${fraction}e${newExponent}`;
	},
);
