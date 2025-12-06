import { regex } from "arkregex";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { CRLF } from "$/resp/constants";
import { LeftoverData, noLeftover } from "$/resp/utils";
import { NaN_ } from "$/schema/number";
import { Color } from "$/schema/utils";
import { toOptimalExponential } from "./utils";

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
		Schema.pattern(/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/, {
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

const LeftoverDoubleRegex = regex(`^(?<data>.+?)${CRLF}(?<leftover>.*)$`, "s");
export const LeftoverDouble = LeftoverDouble_.pipe(
	Schema.transformOrFail(LeftoverData(DoubleValue), {
		decode: Effect.fn(function* (template, _opts, ast) {
			const input = template[1];
			const result = LeftoverDoubleRegex.exec(input);
			if (!result) {
				const expected = Color.good(`{content}${CRLF}{leftover}`);
				const received = Color.bad(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				const issue = new ParseResult.Type(ast, input, message);
				return yield* ParseResult.fail(issue);
			}

			const { data, leftover } = result.groups;
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
