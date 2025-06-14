import { Effect, Function as Fn, type Utils } from "effect";

export type EffectGen<
	TEffect extends Effect.Effect<unknown, unknown, unknown>,
> = Generator<
	Utils.YieldWrap<
		Effect.Effect<
			unknown,
			Effect.Effect.Error<TEffect>,
			Effect.Effect.Context<TEffect>
		>
	>,
	Effect.Effect.Success<TEffect>,
	never
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

export interface ReleaseEffect {
	release: Effect.Effect<void>;
}
