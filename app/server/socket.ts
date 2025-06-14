import type { ReleaseEffect } from "$/utils/effect";
import { Data, Effect, FiberSet, flow } from "effect";
import type { Socket } from "node:net";

export function createSocketResource(socket: Socket) {
	const openSocketResource = Effect.async<Socket>((resume) => {
		if (socket.readyState === "open") {
			resume(Effect.succeed(socket));
			return;
		}

		function handleConnection() {
			resume(Effect.succeed(socket));
		}

		socket.once("connect", handleConnection);
		return Effect.sync(() => {
			socket.off("connect", handleConnection);
		});
	}).pipe(Effect.tap(Effect.logInfo("Socket connected")));

	return openSocketResource.pipe(
		Effect.acquireRelease((socket) => {
			return Effect.async<void>((resume) => {
				if (socket.readyState === "closed") {
					return Effect.void.pipe(resume);
				}

				socket.end(() => Effect.void.pipe(resume));
			}).pipe(Effect.tap(Effect.logInfo("Socket closed")));
		}),
	);
}

export function writeToSocket(socket: Socket, data: string) {
	if (!socket.writable) {
		return Effect.fail(new SocketWriteError());
	}

	return Effect.async<void, SocketWriteError>((resume) => {
		socket.write(data, (err) => {
			const result = err ? Effect.fail(new SocketWriteError()) : Effect.void;
			resume(result);
		});
	});
}
class SocketWriteError extends Data.TaggedError("SocketWrite") {}

/** Resolves when socket connection ends */
export const runSocketDataHandler = Effect.fn(function* (
	socket: Socket,
	handler: (data: Buffer) => Effect.Effect<void>,
) {
	const run = yield* FiberSet.makeRuntime<never, void, never>();
	return yield* Effect.async<ReleaseEffect>((resolve) => {
		const dataHandler = flow(handler, run);
		const endHandler = () => resolve(Effect.succeed({ release }));

		socket.on("data", dataHandler);
		socket.once("end", endHandler);

		const release = Effect.sync(() => {
			socket.off("data", dataHandler);
			socket.off("end", endHandler);
		});

		return release;
	}).pipe(
		Effect.acquireRelease((c) => c.release),
		Effect.andThen(Effect.void),
		Effect.withSpan("message"),
	);
});

export type { Socket };
