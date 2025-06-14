import { Effect } from "effect";

export const logInfo = createLogFn(Effect.logInfo);
export const logError = createLogFn(Effect.logError);
export const logFatal = createLogFn(Effect.logFatal);

function createLogFn(logger: (data: unknown) => Effect.Effect<void>) {
	return function (data: unknown, annotations?: Record<string, unknown>) {
		const log = logger(data);
		if (!annotations) {
			return log;
		}

		return Effect.annotateLogs(log, annotations);
	};
}
