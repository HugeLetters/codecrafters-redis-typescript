import { Config as C, ConfigProvider, Context, Effect, Schema } from "effect";
import { identity } from "effect/Function";
import { Integer } from "./schema/number";

const HOST = Schema.Config("HOST", Schema.String).pipe(
	C.withDefault("0.0.0.0"),
);

const IntStringSchema = Schema.NumberFromString.pipe(
	Schema.transform(Integer, { decode: identity, encode: identity }),
);

const defaultPort = Integer.make(6379);
const PORT = Schema.Config("PORT", IntStringSchema).pipe(
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
