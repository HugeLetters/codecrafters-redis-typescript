import { Integer as Integer_, IntegerFromString, NaN_ } from "$/schema/number";
import { DigitString, ImplicitNumberSign } from "$/schema/string";
import { Log, parseFail } from "$/schema/utils";
import { BigInt as BigInt_, Effect, ParseResult, Schema, flow } from "effect";
import { CRLF } from "./constants";
import { LeftoverData, noLeftover } from "./leftover";

export const IntegerPrefix = ":";
const LeftoverInteger_ = Schema.TemplateLiteralParser(
	IntegerPrefix,
	ImplicitNumberSign,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverInteger" }));

const IntegerRegex = /^(\d+)\r\n([\s\S]*)$/;
const parseIntFromString = ParseResult.decode(IntegerFromString);
export const LeftoverInteger = LeftoverInteger_.pipe(
	Schema.transformOrFail(LeftoverData(Integer_), {
		decode: Effect.fn(function* (template, _opts, ast) {
			const str = template[2];
			const result = IntegerRegex.exec(str);
			if (result === null) {
				const expected = Log.expected(`{integer}${CRLF}{leftover}`);
				const received = Log.received(str);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, str, message);
			}

			const [_match, digits = "", leftover = ""] = result;
			const number = yield* parseIntFromString(digits);
			const sign = template[1] === "+" ? 1 : -1;
			const output = sign * number;
			return { data: output, leftover };
		}),
		encode(input) {
			const integer = input.data;
			type Output = typeof LeftoverInteger_.Type;
			const output: Output = [
				IntegerPrefix,
				integer < 0 ? "-" : "+",
				`${Math.abs(integer)}${CRLF}${input.leftover}`,
			];
			return ParseResult.succeed(output);
		},
		strict: true,
	}),
);

export const Integer = LeftoverInteger.pipe(
	noLeftover((t) => t.leftover, "RespInteger"),
	Schema.transform(Schema.typeSchema(Integer_), {
		decode(template) {
			return template.data;
		},
		encode(integer) {
			return { data: integer, leftover: "" };
		},
	}),
);

const NanLiteral = "nan";
const NanFromString = Schema.Literal(NanLiteral).pipe(
	Schema.transform(NaN_, {
		decode() {
			return Number.NaN;
		},
		encode(): typeof NanLiteral {
			return NanLiteral;
		},
	}),
	Schema.annotations({ identifier: "NaNFromString" }),
);

const InfinityFromString = Schema.transformLiterals(
	["inf", Number.POSITIVE_INFINITY],
	["-inf", Number.NEGATIVE_INFINITY],
).pipe(Schema.annotations({ identifier: "InfinityFromString" }));

export const DoublePrefix = ",";
const LeftoverDouble_ = Schema.TemplateLiteralParser(
	DoublePrefix,
	Schema.String,
).pipe(Schema.annotations({ identifier: "LeftoverDouble" }));

const DoubleValue = Schema.Union(
	InfinityFromString,
	NanFromString,
	Schema.String.pipe(
		Schema.pattern(/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/, {
			identifier: "NumberString",
		}),
		Schema.transform(Schema.Number, {
			decode(s) {
				return Number.parseFloat(s);
			},
			encode(s) {
				const standard = s.toString();
				const exponential = toOptimalExponential(s);
				return exponential.length < standard.length ? exponential : standard;
			},
		}),
		Schema.finite({ identifier: "NumberFromString" }),
	),
);

const LeftoverDoubleRegex = /^([\s\S]+?)\r\n([\s\S]*)$/;
export const LeftoverDouble = LeftoverDouble_.pipe(
	Schema.transformOrFail(LeftoverData(DoubleValue), {
		decode: Effect.fn(function* (template, _opts, ast) {
			const input = template[1];
			const result = LeftoverDoubleRegex.exec(input);
			if (!result) {
				const expected = Log.expected(`{content}${CRLF}{leftover}`);
				const received = Log.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const [_match, data = "", leftover = ""] = result;
			return { data, leftover };
		}),
		encode(input) {
			type Output = typeof LeftoverDouble_.Type;
			const str = `${input.data}${CRLF}${input.leftover}`;
			return ParseResult.succeed<Output>([DoublePrefix, str]);
		},
	}),
);

export const Double = LeftoverDouble.pipe(
	noLeftover((data) => data.leftover, "Double"),
	Schema.transform(Schema.Number, {
		decode(data) {
			return data.data;
		},
		encode(data): typeof LeftoverDouble.Type {
			return { data, leftover: "" };
		},
	}),
);

export const BigNumberPrefix = "(";
export const BigNumber = Schema.TemplateLiteralParser(
	BigNumberPrefix,
	ImplicitNumberSign,
	DigitString.pipe(Schema.compose(Schema.BigInt)),
	CRLF,
).pipe(
	Schema.annotations({ identifier: "BigNumber" }),
	Schema.transform(Schema.BigIntFromSelf, {
		decode(template) {
			const biging = template[2];
			const sign = template[1] === "+" ? 1n : -1n;
			return sign * biging;
		},
		encode(bigint) {
			return [
				BigNumberPrefix,
				bigint < 0 ? "-" : "+",
				BigInt_.abs(bigint),
				CRLF,
			] as const;
		},
	}),
);

const toOptimalExponential = flow(
	(x: number) => x.toExponential(),
	(x) => {
		const [base, exponent] = x.split("e");
		if (!base || !exponent) {
			return x;
		}

		const [int, fraction = ""] = base.split(".");
		const newExponent = Number.parseInt(exponent) - fraction.length;
		return `${int}${fraction}e${newExponent}`;
	},
);
