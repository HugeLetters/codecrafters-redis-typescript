import * as Config from "effect/Config";
import * as Schema from "effect/Schema";
import { Integer, IntegerFromString } from "$/schema/number";

const HOST = Config.string("host").pipe(Config.withDefault("0.0.0.0"));

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("port", IntegerFromString).pipe(
	Config.withDefault(defaultPort),
);

const ServerConfig = Config.all({ HOST, PORT });

export { ServerConfig as Config };
