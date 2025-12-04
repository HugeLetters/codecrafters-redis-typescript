import * as Schema from "effect/Schema";
import { RespError } from "$/resp/error";
import { noLeftover } from "$/resp/utils";
import {
	LeftoverBulkStringContent,
	LeftoverError,
} from "$/resp/v2/string/utils";

export const BulkErrorPrefix = "!";
const LeftoverBulkErrorTemplate = Schema.TemplateLiteralParser(
	BulkErrorPrefix,
	LeftoverBulkStringContent,
).pipe(Schema.annotations({ identifier: "LeftoverBulkError" }));

export const LeftoverBulkError = LeftoverBulkErrorTemplate.pipe(
	Schema.transform(LeftoverError, {
		decode(template) {
			const data = template[1];
			const message = data.data;
			const { _tag } = RespError;
			return { data: { _tag, message }, leftover: data.leftover };
		},
		encode(data): typeof LeftoverBulkErrorTemplate.Type {
			return [
				BulkErrorPrefix,
				{ data: data.data.message, leftover: data.leftover },
			];
		},
	}),
);

export const BulkError = LeftoverBulkError.pipe(
	noLeftover((t) => t.leftover, "BulkError"),
	Schema.transform(Schema.typeSchema(RespError), {
		decode(template) {
			return template.data;
		},
		encode(data): typeof LeftoverBulkError.Type {
			return { data, leftover: "" };
		},
	}),
);
