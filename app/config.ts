import { Integer, IntegerFromString } from "$/schema/number";
import { Config as C, ConfigProvider, Effect, Schema, flow } from "effect";

const HOST = Schema.Config("HOST", Schema.String).pipe(
	C.withDefault("0.0.0.0"),
);

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntegerFromString).pipe(
	C.withDefault(defaultPort),
);

export class Config extends Effect.Service<Config>()("Config", {
	effect: C.all({ HOST, PORT }),
}) {}

export function provideConfigService(provider = ConfigProvider.fromEnv()) {
	return flow(
		Effect.provide(Config.Default),
		Effect.withConfigProvider(provider),
	);
}
