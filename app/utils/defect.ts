import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import { Logger } from "./logger";

export const logDefect = Effect.tapDefect((e) => {
	return Logger.logFatal("Defect", { cause: Cause.pretty(e) });
});
