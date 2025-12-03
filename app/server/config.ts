import * as Config from "effect/Config";
import * as Schema from "effect/Schema";
import { Integer, IntegerFromString } from "$/schema/number";

const HOST = Config.string("HOST").pipe(Config.withDefault("0.0.0.0"));

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntegerFromString).pipe(
	Config.withDefault(defaultPort),
);

const ServerConfig = Config.all({ HOST, PORT });

export { ServerConfig as Config };
