import { Cause, Effect } from "effect";

export const logDefect = Effect.tapDefect((e) => {
	return Effect.logFatal("Defect").pipe(
		Effect.annotateLogs("cause", Cause.pretty(e)),
	);
});
