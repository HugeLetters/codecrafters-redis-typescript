import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Layer from "effect/Layer";
import { AppConfig } from "$/config";
import { KV } from "$/kv";
import { StartMaster } from "$/master";
import { Protocol } from "$/protocol";
import { Replication } from "$/replication";
import { StartSlave } from "$/slave";
import { argvConfigProvider } from "$/utils/config/argv";

const Main = Effect.gen(function* () {
	const replication = yield* Replication.Replication;
	if (replication.data.role === "master") {
		return yield* StartMaster;
	}

	yield* StartSlave;
});

const DevToolsLive = DevTools.layerWebSocket().pipe(
	Layer.provide(BunSocket.layerWebSocketConstructor),
);

const BunLive = BunContext.layer;
const AppConfigLive = AppConfig.Default.pipe(Layer.provide(BunLive));
const ReplicationLive = Replication.Replication.Default.pipe(
	Layer.provide(AppConfigLive),
);
const KvStorageLive = KV.KvStorage.Default.pipe(
	Layer.provide([AppConfigLive, BunLive]),
);
const MainLive = Layer.mergeAll(KvStorageLive, AppConfigLive, ReplicationLive);

Main.pipe(
	Effect.provide(MainLive),
	Effect.withConfigProvider(argvConfigProvider()),
	Protocol.config({
		// codecrafters seems to pretty much always expect a bulk string
		shouldTrySimpleStringEncode: Fn.constFalse,
	}),
	Effect.provide(DevToolsLive),
	Effect.scoped,
	BunRuntime.runMain,
);
