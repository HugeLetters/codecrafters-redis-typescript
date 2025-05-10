import { CR, CRLF, LF } from "$/schema/resp/constants";
import { Error_ } from "$/schema/resp/error";
import { noLeftover } from "$/schema/resp/leftover";
import { Log, parseTypeFail } from "$/schema/utils";
import { Effect, ParseResult, Schema } from "effect";
import { LeftoverError, LeftoverString } from "./utils";

const SimpleStringRegex = /^([\s\S]*?)\r\n([\s\S]*)$/;
const ClRfRegex = /[\r\n]/;
const ClRfFilterMessage = `Leftover string data cannot contain ${Log.received(CR)} or ${Log.received(LF)}`;
const LeftoverSimpleStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const match = SimpleStringRegex.exec(input);
			if (!match) {
				const expected = Log.expected(`{content}${CRLF}{leftover}`);
				const received = Log.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseTypeFail(ast, input, message);
			}

			const [_match, data = "", leftover = ""] = match;
			return { data, leftover };
		}),
		encode(data) {
			return ParseResult.succeed(`${data.data}${CRLF}${data.leftover}`);
		},
	}),
	Schema.filter((input) => {
		if (ClRfRegex.test(input.data)) {
			return `${ClRfFilterMessage}. Received ${Log.received(input.data)}`;
		}
	}),
	Schema.annotations({ identifier: "LeftoverSimpleStringContent" }),
);

export const SimpleStringPrefix = "+";
export const LeftoverSimpleString = Schema.TemplateLiteralParser(
	SimpleStringPrefix,
	LeftoverSimpleStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverSimpleString" }));

export const SimpleString = LeftoverSimpleString.pipe(
	noLeftover((t) => t[1].leftover, "SimpleString"),
	Schema.transform(Schema.String, {
		decode(template) {
			return template[1].data;
		},
		encode(str): typeof LeftoverSimpleString.Type {
			return [SimpleStringPrefix, { data: str, leftover: "" }];
		},
	}),
);

export const SimpleErrorPrefix = "-";
const LeftoverSimpleErrorTemplate = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	LeftoverSimpleStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverSimpleError" }));

export const LeftoverSimpleError = LeftoverSimpleErrorTemplate.pipe(
	Schema.transform(LeftoverError, {
		decode(template) {
			const data = template[1];
			const message = data.data;
			const { _tag } = Error_;
			return { data: { _tag, message }, leftover: data.leftover };
		},
		encode(data): typeof LeftoverSimpleErrorTemplate.Type {
			return [
				SimpleErrorPrefix,
				{ data: data.data.message, leftover: data.leftover },
			];
		},
	}),
);

export const SimpleError = LeftoverSimpleError.pipe(
	noLeftover((t) => t.leftover, "SimpleError"),
	Schema.transform(Schema.typeSchema(Error_), {
		decode(template) {
			return template.data;
		},
		encode(err): typeof LeftoverSimpleError.Type {
			return { data: err, leftover: "" };
		},
		strict: true,
	}),
);
