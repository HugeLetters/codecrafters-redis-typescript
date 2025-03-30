import { Config as C, Schema } from "effect";

const HOST = Schema.Config("HOST", Schema.String).pipe(
	C.withDefault("0.0.0.0"),
);

const IntStringSchema = Schema.NumberFromString.pipe(
	Schema.int(),
	Schema.brand("INT"),
);

const defaultPort = IntStringSchema.make(6379);
const PORT = Schema.Config("PORT", IntStringSchema).pipe(
	C.withDefault(defaultPort),
);

export const Config = C.all({ HOST, PORT });
