import type { Integer } from "$/schema/number";
import { Data, Effect, Iterable, Queue } from "effect";

export type Capacity = typeof Integer.Type;
export type Job = Effect.Effect<void, never, never>;
class JobQueue extends Data.TaggedClass("JobQueue") {
	readonly capacity;
	readonly queue;

	constructor(capacity: Capacity, queue: Queue.Queue<Job>) {
		super();
		this.capacity = capacity;
		this.queue = queue;
	}
}

export type { JobQueue };

/**
 * Creates a bounded job queue and immediately starts executing it
 */
export const make = Effect.fn(function* (capacity: Capacity) {
	const queue = yield* Queue.bounded<Job>(capacity);

	const job = Effect.gen(function* () {
		while (true) {
			yield* Queue.take(queue).pipe(Effect.flatten);
		}
	});
	const fibers = Iterable.makeBy(() => job, { length: capacity });

	yield* Effect.all(fibers, { concurrency: capacity }).pipe(Effect.fork);

	return new JobQueue(capacity, queue);
});

export const offer = Effect.fn(function* (queue: JobQueue, job: Job) {
	return yield* Queue.offer(queue.queue, job);
});
