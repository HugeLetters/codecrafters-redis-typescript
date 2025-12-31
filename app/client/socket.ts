import { EventEmitter } from "node:events";
import { BunRuntime } from "@effect/platform-bun";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import { AppConfig } from "$/config";
import { Protocol } from "$/protocol";

interface SocketEventMap {
	data: [string];
	close: [];
}
interface RawClient {
	write: (data: string) => void;
	close: () => void;
}

export interface Client {
	write: (data: Protocol.Decoded) => void;
	close: () => void;
}
interface SocketOptions {
	onMessage: (message: Protocol.Decoded) => void;
	onError: (error: string) => void;
	onStatusChange: (status: string) => void;
	onClientReady: (client: Client) => void;
}

const initializeSocket = Effect.fn(function* (opts: SocketOptions) {
	const config = yield* AppConfig;

	const socketEmitter = new EventEmitter<SocketEventMap>();
	const rawClient = yield* Effect.async<RawClient, SocketConnectionError>(
		(resolve) => {
			Bun.connect({
				hostname: config.host,
				port: config.port,
				socket: {
					open(socket) {
						opts.onStatusChange("Open");

						const client: RawClient = {
							close() {
								if (socket.readyState <= 0) {
									return;
								}

								socket.end();
								opts.onStatusChange("Closed");
							},
							write(data) {
								if (socket.readyState <= 0) {
									const error = `Trying to write socket in state: ${socket.readyState}`;
									opts.onError(error);
									return;
								}

								socket.write(data);
							},
						};

						resolve(Effect.succeed(client));
					},

					data(_socket, data) {
						socketEmitter.emit("data", data.toString("utf-8"));
					},

					close() {
						opts.onStatusChange("Closed");
						socketEmitter.emit("close");
					},
					connectError(_socket, err) {
						opts.onStatusChange("Failed to connect");
						opts.onError(err.message);
						resolve(new SocketConnectionError());
					},
					error(_socket, err) {
						opts.onError(err.message);
					},
					timeout() {
						opts.onError("Message timeout");
					},
				},
			});
		},
	).pipe(
		Effect.acquireRelease((client) => {
			return Effect.sync(() => {
				client.close();
			});
		}),
	);

	const run = yield* FiberSet.makeRuntime<never, void, never>();
	const dataConsumer = Effect.async<void>((resolve) => {
		const onData = Fn.flow(
			Protocol.decode,
			Effect.map(opts.onMessage),
			Effect.catchTag(
				"ParseError",
				Fn.flow((e) => opts.onError(e.message), Effect.succeed),
			),
			run,
		);

		function onClose() {
			cleanup();
			resolve(Effect.void);
		}

		socketEmitter.on("data", onData);
		socketEmitter.once("close", onClose);

		function cleanup() {
			socketEmitter.off("data", onData);
			socketEmitter.off("close", onClose);
		}

		return Effect.sync(cleanup);
	}).pipe(Effect.andThen(Effect.void));

	opts.onClientReady({
		close: rawClient.close,
		write: Fn.flow(
			Protocol.encode,
			Effect.map(rawClient.write),
			Effect.catchTag(
				"ParseError",
				Fn.flow((e) => opts.onError(e.message), Effect.succeed),
			),
			run,
		),
	});

	yield* dataConsumer;
});

export const createSocket = Fn.flow(
	initializeSocket,
	Effect.catchTag("SocketConnectionError", () => Effect.void),
	Effect.provide(AppConfig.Default),
	Effect.scoped,
	BunRuntime.runMain,
);

class SocketConnectionError extends Data.TaggedError("SocketConnectionError") {}
