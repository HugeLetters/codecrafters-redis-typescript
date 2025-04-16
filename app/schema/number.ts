import { Schema } from "effect";

export const Integer = Schema.Int.pipe(Schema.brand("INT"));

export const IntegerFromString = Schema.NumberFromString.pipe(
	Schema.compose(Integer),
);
