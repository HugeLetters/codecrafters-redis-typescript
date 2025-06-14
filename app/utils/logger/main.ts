import { Effect, flow } from "effect";

export const logInfo = createLogFn(Effect.logInfo);
export const logError = createLogFn(Effect.logError);
export const logFatal = createLogFn(Effect.logFatal);

function createLogFn(logger: (data: unknown) => Effect.Effect<void>) {
	const fn = function (data: unknown, annotations?: Record<string, unknown>) {
		const log = logger(data);
		if (!annotations) {
			return log;
		}

		return Effect.annotateLogs(log, annotations);
	};

	fn.tap = flow(fn, Effect.tap<Effect.Effect<void>>);

	return fn;
}
