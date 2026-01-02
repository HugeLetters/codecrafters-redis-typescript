import { DevTools } from "@effect/experimental";
import { BunRuntime, BunSocket } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Layer from "effect/Layer";
import { Command } from "$/command";
import { AppConfig } from "$/config";
import { Protocol } from "$/protocol";
import { StartMaster } from "./master";
import { Replication } from "./replication";
import { StartSlave } from "./slave";
import { argvConfigProvider } from "./utils/config/argv";

const Main = Effect.gen(function* () {
	const replication = yield* Replication.Service;
	if (replication.data.role === "master") {
		return yield* StartMaster;
	}

	yield* StartSlave;
});

const DevToolsLive = DevTools.layerWebSocket().pipe(
	Layer.provide(BunSocket.layerWebSocketConstructor),
);

Main.pipe(
	Effect.provide([
		Command.Processor.Default,
		AppConfig.Default,
		Replication.Service.Default,
	]),
	Effect.withConfigProvider(argvConfigProvider()),
	Protocol.config({
		// codecrafters seems to pretty much always expect a bulk string
		shouldTrySimpleStringEncode: Fn.constFalse,
	}),
	Effect.provide(DevToolsLive),
	Effect.scoped,
	BunRuntime.runMain,
);
