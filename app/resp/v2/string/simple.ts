import { regex } from "arkregex";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { CR, CRLF, LF } from "$/resp/constants";
import { RespError } from "$/resp/error";
import { noLeftover } from "$/resp/utils";
import { Color } from "$/schema/utils";
import { LeftoverError, LeftoverString } from "./utils";

const SimpleStringRegex = regex(
	`^(?<data>[\\s\\S]*?)${CRLF}(?<leftover>[\\s\\S]*)$`,
);
const ClRfRegex = regex(`[${CR}${LF}]`);
const ClRfFilterMessage = `Leftover string data cannot contain ${Color.bad(CR)} or ${Color.bad(LF)}`;
const LeftoverSimpleStringContent = Schema.String.pipe(
	Schema.transformOrFail(LeftoverString, {
		decode: Effect.fn(function* (input, _opts, ast) {
			const match = SimpleStringRegex.exec(input);
			if (!match) {
				const expected = Color.good(`{content}${CRLF}{leftover}`);
				const received = Color.bad(input);
				const message = `Expected string matching: ${expected}. Received ${received}`;
				const issue = new ParseResult.Type(ast, input, message);
				return yield* ParseResult.fail(issue);
			}

			const { data, leftover } = match.groups;
			return { data, leftover };
		}),
		encode(data) {
			return ParseResult.succeed(`${data.data}${CRLF}${data.leftover}`);
		},
	}),
	Schema.filter((input) => {
		if (ClRfRegex.test(input.data)) {
			return `${ClRfFilterMessage}. Received ${Color.bad(input.data)}`;
		}

		return true;
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
			const { _tag } = RespError;
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
	Schema.transform(Schema.typeSchema(RespError), {
		decode(template) {
			return template.data;
		},
		encode(err): typeof LeftoverSimpleError.Type {
			return { data: err, leftover: "" };
		},
		strict: true,
	}),
);
