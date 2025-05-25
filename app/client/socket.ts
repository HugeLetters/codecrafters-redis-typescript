import { Config, provideConfigService } from "$/config";
import { Resp } from "$/schema/resp";
import { BunRuntime } from "@effect/platform-bun";
import { Effect, FiberSet, Schema, flow } from "effect";
import { EventEmitter } from "node:events";

interface SocketEventMap {
	data: [string];
	close: [];
}
interface RawClient {
	write: (data: string) => void;
	close: () => void;
}

export interface Client {
	write: (data: Resp.RespValue) => void;
	close: () => void;
}
interface SocketOptions {
	onMessage: (message: Resp.RespValue) => void;
	onError: (error: string) => void;
	onStatusChange: (status: string) => void;
	onClientReady: (client: Client) => void;
}

const initializeSocket = Effect.fn(function* (opts: SocketOptions) {
	const config = yield* Config;

	const socketEmitter = new EventEmitter<SocketEventMap>();
	const rawClient = yield* Effect.async<RawClient>((resolve) => {
		Bun.connect({
			hostname: config.HOST,
			port: config.PORT,
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
				},
				error(_socket, err) {
					opts.onError(err.message);
				},
				timeout() {
					opts.onError("Message timeout");
				},
			},
		});
	}).pipe(
		Effect.acquireRelease((client) => {
			return Effect.sync(() => {
				client.close();
			});
		}),
	);

	const run = yield* FiberSet.makeRuntime<never, void, never>();
	const dataConsumer = Effect.async<void>((resolve) => {
		const onData = flow(
			decodeResp,
			Effect.map(opts.onMessage),
			Effect.catchTag(
				"ParseError",
				flow((e) => opts.onError(e.message), Effect.succeed),
			),
			run,
		);

		function onClose() {
			resolve(Effect.void);
		}

		socketEmitter.on("data", onData);
		socketEmitter.on("close", onClose);
		return Effect.sync(() => {
			socketEmitter.off("data", onData);
			socketEmitter.off("close", onClose);
		});
	});

	opts.onClientReady({
		close: rawClient.close,
		write: flow(
			encodeResp,
			Effect.map(rawClient.write),
			Effect.catchTag(
				"ParseError",
				flow((e) => opts.onError(e.message), Effect.succeed),
			),
			run,
		),
	});

	yield* dataConsumer;
});

const decodeResp = Schema.decode(Resp.RespValue);
const encodeResp = Schema.encode(Resp.RespValue);

export const createSocket = flow(
	initializeSocket,
	provideConfigService(),
	Effect.scoped,
	BunRuntime.runMain,
);
