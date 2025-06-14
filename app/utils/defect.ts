import { Cause, Effect } from "effect";
import { Logger } from "./logger";

export const logDefect = Effect.tapDefect((e) => {
	return Logger.logFatal("Defect", { cause: Cause.pretty(e) });
});
