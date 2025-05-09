import type { Effect, Utils } from "effect";

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
