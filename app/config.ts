import { Integer, IntegerFromString } from "$/schema/number";
import { Config as C, ConfigProvider, Context, Effect, Schema } from "effect";

const HOST = Schema.Config("HOST", Schema.String).pipe(
	C.withDefault("0.0.0.0"),
);

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntegerFromString).pipe(
	C.withDefault(defaultPort),
);

const ConfigSchema = C.all({ HOST, PORT });
type ConfigType = Effect.Effect.Success<typeof ConfigSchema>;

export class Config extends Context.Tag("Config")<Config, ConfigType>() {}

export function provideConfigService(provider = ConfigProvider.fromEnv()) {
	return Effect.provideServiceEffect(
		Config,
		ConfigSchema.pipe(Effect.withConfigProvider(provider)),
	);
}
