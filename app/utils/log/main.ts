import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import type * as Record from "effect/Record";

type Annotations = Record.ReadonlyRecord<string, unknown>;

/**
 * Adds a span both for logging and tracing
 */
export function withSpan(name: string, annotations?: Annotations) {
	return Fn.flow(
		Effect.withSpan(name),
		Effect.withLogSpan(name),
		annotations ? annotate(annotations) : Fn.identity,
	);
}

/**
 * Adds a annotation both for logging and tracing
 */
export function annotate(annotations: Annotations) {
	return Fn.flow(
		Effect.annotateSpans(annotations),
		Effect.annotateLogs(annotations),
	);
}

function createLogger(
	logger: (...data: ReadonlyArray<unknown>) => Effect.Effect<void>,
) {
	return function (data: unknown, annotations: Annotations) {
		const log = logger(data);
		return Effect.annotateLogs(log, annotations);
	};
}

export const logInfo = createLogger(Effect.logInfo);
export const logError = createLogger(Effect.logError);
export const logFatal = createLogger(Effect.logFatal);
