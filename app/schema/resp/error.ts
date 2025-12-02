import * as Schema from "effect/Schema";

export class Error_ extends Schema.TaggedError<Error_>()("RespError", {
	message: Schema.String,
}) {}
