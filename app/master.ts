import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Command } from "$/command";
import { StartServer } from "$/server";

const MasterCommandProcessor = Command.Processor.Default.pipe(
	Layer.provide(Command.Executor.Default),
);

export const StartMaster = StartServer.pipe(
	Effect.provide(MasterCommandProcessor),
);
