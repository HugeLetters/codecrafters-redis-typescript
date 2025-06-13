import { Integer, IntegerFromString } from "$/schema/number";
import { Config as C, ConfigProvider, Effect, Layer, Schema } from "effect";

const HOST = C.string("HOST").pipe(C.withDefault("0.0.0.0"));

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntegerFromString).pipe(
	C.withDefault(defaultPort),
);

export class Config extends Effect.Service<Config>()("Config", {
	effect: C.all({ HOST, PORT }),
}) {}

export function ConfigLive(provider = ConfigProvider.fromEnv()) {
	const ConfigProviderLayer = Layer.setConfigProvider(provider);
	return Config.Default.pipe(Layer.provide(ConfigProviderLayer));
}
