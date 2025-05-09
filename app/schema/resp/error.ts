import { Schema } from "effect";

export class Error_ extends Schema.TaggedError<Error_>()("RespError", {
	message: Schema.String,
}) {}
