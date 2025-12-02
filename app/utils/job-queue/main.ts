import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Iterable from "effect/Iterable";
import * as Queue from "effect/Queue";
import type { Integer } from "$/schema/number";

export type Capacity = Integer;
export type Job<R = never> = Effect.Effect<void, never, R>;
class JobQueue<R> extends Data.TaggedClass("JobQueue") {
	readonly capacity;
	readonly queue;

	constructor(capacity: Capacity, queue: Queue.Queue<Job<R>>) {
		super();
		this.capacity = capacity;
		this.queue = queue;
	}
}

export type { JobQueue };

/**
 * Creates a bounded job queue and immediately starts executing it
 */
export const make = Effect.fn(function* <R = never>(capacity: Capacity) {
	const queue = yield* Queue.bounded<Job<R>>(capacity);

	const job = Effect.gen(function* () {
		while (true) {
			yield* Queue.take(queue).pipe(Effect.flatten);
		}
	});
	const fibers = Iterable.makeBy(() => job, { length: capacity });

	yield* Effect.all(fibers, { concurrency: capacity }).pipe(Effect.fork);

	return new JobQueue(capacity, queue);
});

export const offer = Effect.fn(function* <R>(queue: JobQueue<R>, job: Job<R>) {
	return yield* Queue.offer(queue.queue, job);
});
