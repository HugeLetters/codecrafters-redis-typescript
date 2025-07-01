import { Config as C } from "effect";

const dir = C.string("dir").pipe(C.withDefault("./tmp"));

const dbFilename = C.string("dbfilename").pipe(C.withDefault("dump.rdb"));

export const Config = C.all({
	dir,
	dbFilename,
});
