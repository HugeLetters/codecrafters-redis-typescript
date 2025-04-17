/**
 * Port of `@effect/vitest` library
 */

import * as V from "bun:test";
import {
	Arbitrary,
	Cause,
	Duration,
	Effect,
	Exit,
	FastCheck,
	Layer,
	Logger,
	Schedule,
	Schema,
	Scope,
	TestContext,
	type TestServices,
} from "effect";
import type { NonEmptyArray } from "effect/Array";
import { flow, identity } from "effect/Function";
import { isObject } from "effect/Predicate";

export namespace Buntest {
	type API = V.Test;

	export type TestFunction<A, E, R, TestArgs extends Array<unknown>> = (
		...args: TestArgs
	) => Effect.Effect<A, E, R>;

	export type Test<R> = <A, E>(
		name: string,
		self: TestFunction<A, E, R, []>,
		timeout?: number | V.TestOptions,
	) => void;

	type Arbitrary = Schema.Schema.Any | FastCheck.Arbitrary<unknown>;
	type ArbitraryType<TArb extends Arbitrary> = TArb extends FastCheck.Arbitrary<
		infer T
	>
		? T
		: Schema.Schema.Type<TArb>;

	type Arbitraries = Record<string, Arbitrary>;
	type ArbitrariesType<TArbs extends Arbitraries> = {
		[K in keyof TArbs]: ArbitraryType<TArbs[K]>;
	};

	export interface Tester<R> extends Buntest.Test<R> {
		skip: Buntest.Test<R>;
		skipIf: (condition: boolean) => Buntest.Test<R>;
		runIf: (condition: boolean) => Buntest.Test<R>;
		only: Buntest.Test<R>;
		each: <T>(
			cases: NonEmptyArray<T>,
		) => <A, E>(
			name: string,
			self: TestFunction<A, E, R, Array<T>>,
			timeout?: number | V.TestOptions,
		) => void;
		fails: Buntest.Test<R>;

		prop: <const TArbs extends Arbitraries, A, E>(
			name: string,
			arbitraries: TArbs,
			self: TestFunction<A, E, R, [ArbitrariesType<TArbs>]>,
			timeout?:
				| number
				| (V.TestOptions & {
						fastCheck?: FastCheck.Parameters<ArbitrariesType<TArbs>>;
				  }),
		) => void;
	}

	export interface MethodsNonLive<R = never> extends API {
		readonly effect: Buntest.Tester<TestServices.TestServices | R>;
		readonly flakyTest: <A, E, R2>(
			self: Effect.Effect<A, E, R2>,
			timeout?: Duration.DurationInput,
		) => Effect.Effect<A, never, R2>;
		readonly scoped: Buntest.Tester<
			TestServices.TestServices | Scope.Scope | R
		>;
		/**
		 * Share a `Layer` between multiple tests, optionally wrapping
		 * the tests in a `describe` block if a name is provided.
		 *
		 * ```ts
		 * import { Context, Effect, Layer } from "effect"
		 *
		 * class Foo extends Context.Tag("Foo")<Foo, "foo">() {
		 *   static Live = Layer.succeed(Foo, "foo")
		 * }
		 *
		 * class Bar extends Context.Tag("Bar")<Bar, "bar">() {
		 *   static Live = Layer.effect(
		 *     Bar,
		 *     Effect.map(Foo, () => "bar" as const)
		 *   )
		 * }
		 *
		 * test.layer(Foo.Live)("layer", (test) => {
		 *   test.effect("adds context", () =>
		 *     Effect.gen(function* () {
		 *       const foo = yield* Foo
		 *       expect(foo).toEqual("foo")
		 *     })
		 *   )
		 *
		 *   test.layer(Bar.Live)("nested", (test) => {
		 *     test.effect("adds context", () =>
		 *       Effect.gen(function* () {
		 *         const foo = yield* Foo
		 *         const bar = yield* Bar
		 *         expect(foo).toEqual("foo")
		 *         expect(bar).toEqual("bar")
		 *       })
		 *     )
		 *   })
		 * })
		 * ```
		 */
		readonly layer: <R2, E>(
			layer: Layer.Layer<R2, E, R>,
			options?: {
				readonly timeout?: Duration.DurationInput;
			},
		) => (
			name: string,
			f: (test: Buntest.MethodsNonLive<R | R2>) => void,
		) => void;

		readonly prop: <const Arbs extends Arbitraries>(
			name: string,
			arbitraries: Arbs,
			self: (properties: ArbitrariesType<Arbs>) => void,
			timeout?:
				| number
				| (V.TestOptions & {
						fastCheck?: FastCheck.Parameters<ArbitrariesType<Arbs>>;
				  }),
		) => void;
	}

	export interface Methods<R = never> extends MethodsNonLive<R> {
		readonly live: Buntest.Tester<R>;
		readonly scopedLive: Buntest.Tester<Scope.Scope | R>;
	}
}

function runTestPromise<E, A>(effect: Effect.Effect<A, E>) {
	return Effect.gen(function* () {
		const exit = yield* Effect.exit(effect);
		if (Exit.isSuccess(exit)) {
			return () => exit.value;
		}

		const errors = Cause.prettyErrors(exit.cause);
		return () => {
			throw errors;
		};
	})
		.pipe(Effect.runPromise)
		.then((f) => f());
}

const TestEnv = TestContext.TestContext.pipe(
	Layer.provide(Logger.remove(Logger.defaultLogger)),
);

function testOptions(timeout?: number | V.TestOptions) {
	return typeof timeout === "number" ? { timeout } : (timeout ?? {});
}

function makeTester<R>(
	mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>,
	base = V.test,
) {
	function run<A, E, TestArgs extends Array<unknown>>(
		args: TestArgs,
		self: Buntest.TestFunction<A, E, R, TestArgs>,
	) {
		return Effect.suspend(() => self(...args)).pipe(mapEffect, runTestPromise);
	}

	const test: Buntest.Tester<R> = (name, self, timeout) => {
		return base(name, () => run([], self), testOptions(timeout));
	};

	test.skip = function (name, self, timeout) {
		return base.skip(name, () => run([], self), testOptions(timeout));
	};

	test.skipIf = function (condition) {
		return function (name, self, timeout) {
			return base.skipIf(condition)(
				name,
				() => run([], self),
				testOptions(timeout),
			);
		};
	};

	test.runIf = function (condition) {
		return function (name, self, timeout) {
			return base.if(condition)(
				name,
				() => run([], self),
				testOptions(timeout),
			);
		};
	};

	test.only = function (name, self) {
		return V.test.only(name, () => run([], self));
	};

	test.each = function (cases) {
		return function (name, self, timeout) {
			return base.each(cases)(
				name,
				(args) => run([args], self),
				testOptions(timeout),
			);
		};
	};

	test.fails = function (name, self) {
		return V.test.failing(name, () => run([], self));
	};

	test.prop = function (name, arbitraries, self, timeout) {
		const arbs = FastCheck.record(
			Object.entries(arbitraries).reduce(
				function (result, [key, arb]) {
					const arbitrary = Schema.isSchema(arb) ? Arbitrary.make(arb) : arb;
					result[key] = arbitrary;
					return result;
				},
				{} as Record<string, FastCheck.Arbitrary<unknown>>,
			),
		);

		return base(
			name,
			() => {
				const prop = FastCheck.asyncProperty(arbs, (as) =>
					run([as as never], self).then((v) => !!v),
				);
				return FastCheck.assert(
					prop,
					isObject(timeout) ? (timeout?.fastCheck as object) : {},
				);
			},
			testOptions(timeout),
		);
	};

	return test;
}

const prop: Buntest.Methods["prop"] = (name, arbitraries, self, timeout) => {
	const arbs = FastCheck.record(
		Object.entries(arbitraries).reduce(
			function (result, [key, arb]) {
				result[key] = Schema.isSchema(arb) ? Arbitrary.make(arb) : arb;
				return result;
			},
			{} as Record<string, FastCheck.Arbitrary<unknown>>,
		),
	);

	return V.test(
		name,
		() => {
			const prop = FastCheck.property(arbs, (as) => self(as as never));
			return FastCheck.assert(
				prop,
				isObject(timeout) ? (timeout?.fastCheck as object) : {},
			);
		},
		testOptions(timeout),
	);
};

function layer<R, E>(
	layer_: Layer.Layer<R, E>,
	options?: {
		readonly memoMap?: Layer.MemoMap;
		readonly timeout?: Duration.DurationInput;
	},
) {
	return function (
		name: string,
		fn: (test: Buntest.MethodsNonLive<R>) => void,
	) {
		const withTestEnv = Layer.provideMerge(layer_, TestEnv);
		const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap);
		const scope = Effect.runSync(Scope.make());
		const runtimeEffect = Layer.toRuntimeWithMemoMap(withTestEnv, memoMap).pipe(
			Scope.extend(scope),
			Effect.orDie,
			Effect.cached,
			Effect.runSync,
		);

		function makeTest(test: V.Test): Buntest.MethodsNonLive<R> {
			return Object.assign(test, {
				effect: makeTester<TestServices.TestServices | R>(
					(effect) =>
						runtimeEffect.pipe(
							Effect.flatMap((runtime) => effect.pipe(Effect.provide(runtime))),
						),
					test,
				),
				prop,
				scoped: makeTester<TestServices.TestServices | Scope.Scope | R>(
					(effect) =>
						runtimeEffect.pipe(
							Effect.flatMap((runtime) =>
								effect.pipe(Effect.scoped, Effect.provide(runtime)),
							),
						),
					test,
				),
				flakyTest,
				layer<R2, E2>(
					nestedLayer: Layer.Layer<R2, E2, R>,
					options?: {
						readonly timeout?: Duration.DurationInput;
					},
				) {
					return layer(Layer.provideMerge(nestedLayer, withTestEnv), {
						...options,
						memoMap,
					});
				},
			});
		}

		V.beforeAll(() => runTestPromise(Effect.asVoid(runtimeEffect)));
		V.afterAll(() => runTestPromise(Scope.close(scope, Exit.void)));
		return V.describe(name, () => {
			return fn(makeTest(V.test));
		});
	};
}

function flakyTest<A, E, R>(
	self: Effect.Effect<A, E, R>,
	timeout: Duration.DurationInput = Duration.seconds(30),
) {
	return self.pipe(
		Effect.catchAllDefect(Effect.fail),
		Effect.retry(
			Schedule.recurs(10).pipe(
				Schedule.compose(Schedule.elapsed),
				Schedule.whileOutput(Duration.lessThanOrEqualTo(timeout)),
			),
		),
		Effect.orDie,
	);
}

function makeMethods(test: V.Test): Buntest.Methods {
	return Object.assign(test, {
		effect: makeTester<TestServices.TestServices>(
			Effect.provide(TestEnv),
			test,
		),
		scoped: makeTester<TestServices.TestServices | Scope.Scope>(
			flow(Effect.scoped, Effect.provide(TestEnv)),
			test,
		),
		live: makeTester<never>(identity, test),
		scopedLive: makeTester<Scope.Scope>(Effect.scoped, test),
		flakyTest,
		layer,
		prop,
	});
}

export const test = makeMethods(V.test);
