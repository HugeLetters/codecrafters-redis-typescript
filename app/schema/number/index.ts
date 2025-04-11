import { Schema } from "effect";

export const Integer = Schema.Number.pipe(Schema.int(), Schema.brand("INT"));

export const IntegerFromString = Schema.NumberFromString.pipe(
	Schema.compose(Integer),
);
