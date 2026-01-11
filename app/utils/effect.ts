import * as Effect from "effect/Effect";
import * as Fn from "effect/Function";
import * as Option from "effect/Option";

export type EffectGen<
	TEffect extends Effect.Effect<unknown, unknown, unknown>,
> = Effect.fn.Return<
	Effect.Effect.Success<TEffect>,
	Effect.Effect.Error<TEffect>,
	Effect.Effect.Context<TEffect>
>;

export const flatMapError = Fn.dual<
	<E1, A2, E2, R2>(
		f: (a: E1) => Effect.Effect<A2, E2, R2>,
	) => <A1, R1>(
		self: Effect.Effect<A1, E1, R1>,
	) => Effect.Effect<A1, A2 | E2, R1 | R2>,
	<A1, E1, R1, A2, E2, R2>(
		self: Effect.Effect<A1, E1, R1>,
		f: (a: E1) => Effect.Effect<A2, E2, R2>,
	) => Effect.Effect<A1, A2 | E2, R1 | R2>
>(2, (self, map) => {
	return self.pipe(
		Effect.catchAll((err) => map(err).pipe(Effect.flatMap(Effect.fail))),
	);
});

// TODO master | delete this fn - its unwieldy i think | by Evgenii Perminov at Sun, 11 Jan 2026 16:33:55 GMT
export const whileLoop = Effect.fn("whileLoop")(function* <T, E, R>(
	initial: T,
	body: (state: T) => Effect.Effect<Option.Option<T>, E, R>,
) {
	let state = initial;
	while (true) {
		const next = yield* body(state);
		if (Option.isNone(next)) {
			return state;
		}

		state = next.value;
	}
});
