import * as Schema from "effect/Schema";

export class RespError extends Schema.TaggedError<RespError>()("RespError", {
	message: Schema.String,
}) {}
