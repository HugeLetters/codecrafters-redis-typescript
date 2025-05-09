import { CR, CRLF, LF } from "$/schema/resp/constants";
import { Error_ } from "$/schema/resp/error";
import { noLeftover } from "$/schema/resp/leftover";
import { notPattern } from "$/schema/string";
import { Log, parseFail } from "$/schema/utils";
import { Effect, ParseResult, Schema } from "effect";
import { LeftoverString } from "./utils";

const CleanString = Schema.String.pipe(
	notPattern(/[\r\n]/),
	Schema.annotations({
		identifier: `string w/o ${Log.received(CR)} or ${Log.received(LF)}`,
	}),
);
const validateCleanString = ParseResult.validate(CleanString);

const SimpleStringRegex = /^([\s\S]*?)\r\n([\s\S]*)$/;
const LeftoverSimpleStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const match = SimpleStringRegex.exec(input);
			if (!match) {
				const expected = Log.expected(`{content}${CRLF}{leftover}`);
				const received = Log.received(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				return yield* parseFail(ast, input, message);
			}

			const [_match, content = "", leftover = ""] = match;
			const data = yield* validateCleanString(content);
			return { data, leftover };
		}),
		encode(data) {
			return ParseResult.succeed(`${data.data}${CRLF}${data.leftover}`);
		},
	}),
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
export const LeftoverSimpleError = Schema.TemplateLiteralParser(
	SimpleErrorPrefix,
	LeftoverSimpleStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverSimpleError" }));

export const SimpleError = LeftoverSimpleError.pipe(
	noLeftover((t) => t[1].leftover, "SimpleError"),
	Schema.transform(Error_, {
		decode(template) {
			const message = template[1].data;
			const { _tag } = Error_;
			return { _tag, message };
		},
		encode(err): typeof LeftoverSimpleError.Type {
			return [SimpleErrorPrefix, { data: err.message, leftover: "" }];
		},
	}),
);
