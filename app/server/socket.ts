import type { Socket } from "node:net";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import { Logger } from "$/utils/logger";

class SocketConnectionError extends Data.TaggedError("SocketConnection")<{
	message: string;
}> {}

export function createSocketResource(socket: Socket) {
	const openSocket = Effect.async<Socket, SocketConnectionError>((resume) => {
		switch (socket.readyState) {
			case "opening": {
				function handleConnection() {
					resume(Effect.succeed(socket));
				}
				function handleError() {
					resume(new SocketConnectionError({ message: "Connection failed" }));
				}
				function handleClose() {
					resume(
						new SocketConnectionError({
							message: "Connection closed before establishing",
						}),
					);
				}

				socket.once("connect", handleConnection);
				socket.once("error", handleError);
				socket.once("close", handleClose);
				return Effect.sync(() => {
					socket.off("connect", handleConnection);
					socket.off("error", handleError);
					socket.off("close", handleClose);
				});
			}
			case "open":
			case "readOnly":
			case "writeOnly":
				resume(Effect.succeed(socket));
				return;
			case "closed":
				resume(
					new SocketConnectionError({ message: "Socket is already closed" }),
				);
				return;
			default:
				return socket.readyState satisfies never;
		}
	}).pipe(Logger.logInfo.tap("Connected"));

	return openSocket.pipe(
		Effect.acquireRelease((socket) => {
			return Effect.async<void>((resume) => {
				if (socket.readyState === "closed") {
					resume(Effect.void);
					return;
				}

				socket.end(() => {
					resume(Effect.void);
				});
			}).pipe(Logger.logInfo.tap("Closed"));
		}),
		Logger.withSpan("socket.resource"),
	);
}

export function writeToSocket(socket: Socket, data: string) {
	if (!socket.writable) {
		return new SocketWriteError();
	}

	return Effect.async<void, SocketWriteError>((resume) => {
		socket.write(data, (err) => {
			const result = err ? new SocketWriteError() : Effect.void;
			resume(result);
		});
	});
}
class SocketWriteError extends Data.TaggedError("SocketWrite") {}

type SocketHandler = (data: Buffer) => Effect.Effect<void>;
/** Resolves when socket connection ends */
export const runSocketDataHandler = Effect.fn(function* (
	socket: Socket,
	handler: SocketHandler,
) {
	const run = yield* FiberSet.makeRuntime<never, void, never>();
	return yield* Effect.async<void>((resolve) => {
		const dataHandler = Fn.flow(handler, run);

		function endHandler() {
			cleanup();
			resolve(Effect.void);
		}

		socket.on("data", dataHandler);
		socket.once("end", endHandler);

		function cleanup() {
			socket.off("data", dataHandler);
			socket.off("end", endHandler);
		}

		return Effect.sync(cleanup);
	});
});

export type { Socket };
