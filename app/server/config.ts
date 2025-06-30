import { Integer, IntegerFromString } from "$/schema/number";
import { Config as C, Schema } from "effect";

const HOST = C.string("HOST").pipe(C.withDefault("0.0.0.0"));

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntegerFromString).pipe(
	C.withDefault(defaultPort),
);

export const Config = C.all({ HOST, PORT });
