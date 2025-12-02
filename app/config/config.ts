import * as Config from "effect/Config";

const dir = Config.string("dir").pipe(Config.withDefault("./tmp"));

const dbFilename = Config.string("dbfilename").pipe(
	Config.withDefault("dump.rdb"),
);

const AppConfig = Config.all({
	dir,
	dbFilename,
});

export { AppConfig as Config };
