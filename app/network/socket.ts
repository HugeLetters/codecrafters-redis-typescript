import type { NetConnectOpts, Socket } from "node:net";
import { createConnection as createNodeConnection } from "node:net";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import { acquireReleaseInterruptible } from "$/utils/resource";

class SocketError extends Data.TaggedError("Socket")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export function createSocketResource(socket: Socket) {
	const openSocket = Effect.async<Socket, SocketError>((resume) => {
		switch (socket.readyState) {
			case "opening": {
				function handleConnection() {
					cleanup();
					resume(Effect.succeed(socket));
				}
				function handleError(error: unknown) {
					cleanup();
					resume(
						new SocketError({
							message: "Connection failed",
							cause: error,
						}),
					);
				}
				function handleClose() {
					cleanup();
					resume(
						new SocketError({
							message: "Connection closed before establishing",
						}),
					);
				}

				function cleanup() {
					socket.off("connect", handleConnection);
					socket.off("error", handleError);
					socket.off("close", handleClose);
				}

				socket.once("connect", handleConnection);
				socket.once("error", handleError);
				socket.once("close", handleClose);
				return Effect.async<void>((resume) => {
					cleanup();
					socket.end(() => {
						resume(Effect.logWarning("Socket initialization interrupted"));
					});
				});
			}
			case "open":
			case "readOnly":
			case "writeOnly":
				resume(Effect.succeed(socket));
				return;
			case "closed":
				resume(
					new SocketError({ message: "Connection closed before establishing" }),
				);
				return;
			default:
				return socket.readyState satisfies never;
		}
	});

	return acquireReleaseInterruptible(openSocket, (socket) => {
		return Effect.async<void>((resume) => {
			if (socket.closed) {
				resume(Effect.void);
				return;
			}

			socket.end(() => {
				resume(Effect.logInfo("Socket Closed"));
			});
		});
	});
}

export const startSocket = Effect.fn(function* (opts: NetConnectOpts) {
	const socket = yield* Effect.sync(() => createNodeConnection(opts));
	return yield* createSocketResource(socket);
});

export type SocketInput = Buffer | Uint8Array | string;

export function writeToSocket(socket: Socket, data: SocketInput) {
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

export type { SocketWriteError };

type SocketHandler = (
	data: Buffer,
	interrupt: () => void,
) => Effect.Effect<void>;
/** Resolves when socket connection ends */
export const handleSocketMessages = Effect.fn(function* (
	socket: Socket,
	handler: SocketHandler,
) {
	const run = yield* FiberSet.makeRuntime<never, void, never>();
	return yield* Effect.async<void>((resume) => {
		const dataHandler = Fn.flow(
			(data: Buffer) => handler(data, endHandler),
			run,
		);

		function endHandler() {
			cleanup();
			resume(Effect.void);
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

export const waitForMessage = Effect.fn(function (socket: Socket) {
	return Effect.async<Buffer, SocketError>((resume) => {
		function dataHandler(data: Buffer) {
			cleanup();
			resume(Effect.succeed(data));
		}
		function endHandler() {
			cleanup();
			resume(
				new SocketError({
					message: "Socket connection ended before receiving next message",
				}),
			);
		}

		socket.once("data", dataHandler);
		socket.once("end", endHandler);

		function cleanup() {
			socket.off("data", dataHandler);
			socket.off("end", endHandler);
		}

		return Effect.sync(cleanup);
	});
});

export const request = Effect.fn("request")(function* (
	socket: Socket,
	data: SocketInput,
) {
	const message = yield* waitForMessage(socket).pipe(Effect.fork);
	yield* writeToSocket(socket, data);
	return yield* message;
});

export type { Socket };
