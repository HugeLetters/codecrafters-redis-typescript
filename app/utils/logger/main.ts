import { Effect, flow, identity } from "effect";

type Annotations = Record<string, unknown>;

export const logInfo = createLogFn(Effect.logInfo);
export const logError = createLogFn(Effect.logError);
export const logFatal = createLogFn(Effect.logFatal);

function createLogFn(logger: (data: unknown) => Effect.Effect<void>) {
	const fn = function (data: unknown, annotations?: Annotations) {
		const log = logger(data);
		if (!annotations) {
			return log;
		}

		return Effect.annotateLogs(log, annotations);
	};

	fn.tap = flow(fn, Effect.tap<Effect.Effect<void>>);

	return fn;
}

/**
 * Adds a span both for logging and tracing
 */
export function withSpan(name: string, annotations?: Annotations) {
	return flow(
		Effect.withSpan(name, { attributes: annotations }),
		Effect.withLogSpan(name),
		annotations ? Effect.annotateLogs(annotations) : identity,
	);
}
