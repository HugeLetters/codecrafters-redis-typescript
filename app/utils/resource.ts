import * as Effect from "effect/Effect";

/** Adds a finalizer for an resource if it succeeds. Resource effect can by interruped. */
export function acquireReleaseInterruptible<A, E, R, R2>(
	resource: Effect.Effect<A, E, R>,
	release: (value: A) => Effect.Effect<void, never, R2>,
) {
	return resource.pipe(
		Effect.tap((resource) => {
			return Effect.addFinalizer(() => release(resource));
		}),
	);
}
