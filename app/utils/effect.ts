import type { Effect, Utils } from "effect";

export type EffectGen<A, E = never, R = never> = Generator<
	Utils.YieldWrap<Effect.Effect<unknown, E, R>>,
	A,
	never
>;
