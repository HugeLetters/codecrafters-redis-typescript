import {
	createServer as createNodeServer,
	type ListenOptions,
	type Server,
} from "node:net";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Fn from "effect/Function";
import type * as Scope from "effect/Scope";
import { acquireReleaseInterruptible } from "$/utils/resource";
import { createSocketResource, type Socket } from "./socket";

class ServerError extends Data.TaggedError("Server")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export function createServerResource(server: Server) {
	const resource = Effect.async<Server, ServerError>((resume) => {
		if (server.listening) {
			resume(Effect.succeed(server));
			return;
		}

		function onListen() {
			cleanup();
			resume(Effect.succeed(server));
		}
		function onClose() {
			cleanup();
			resume(
				new ServerError({
					message: "Server closed before listening",
				}),
			);
		}
		function onError(error: unknown) {
			cleanup();
			resume(
				new ServerError({
					message: "Server errored before listening",
					cause: error,
				}),
			);
		}

		function cleanup() {
			server.off("listening", onListen);
			server.off("close", onClose);
			server.off("error", onError);
		}

		server.once("listening", onListen);
		server.once("close", onClose);
		server.once("error", onError);

		return Effect.async<void>((resume) => {
			cleanup();

			server.close(() => {
				resume(Effect.logWarning("Server initialization interrupted"));
			});
		});
	});

	return acquireReleaseInterruptible(resource, (server) => {
		return Effect.async<void>((resume) => {
			server.close(() => resume(Effect.logInfo("Served closed")));
		});
	});
}

export const startServer = Effect.fn(function* (opts: ListenOptions) {
	const server = yield* Effect.sync(() => createNodeServer().listen(opts));
	return yield* createServerResource(server);
});

/** Resolved when server closes. */
export const handleServerConnections = Effect.fn(function* <R>(
	server: Server,
	handler: (socket: Socket) => Effect.Effect<void, never, Scope.Scope | R>,
) {
	const run = yield* FiberSet.makeRuntime<R, void, never>();
	return yield* Effect.async<void>((resume) => {
		const onConnection = Fn.flow(
			createSocketResource,
			Effect.flatMap(handler),
			Effect.catchTag("Socket", (e) =>
				Effect.logError("Provided socket is not able to connect", e),
			),
			Effect.scoped,
			run,
		);

		function onClose() {
			cleanup();
			resume(Effect.void);
		}
		function onError() {
			cleanup();
			resume(Effect.void);
		}

		function cleanup() {
			server.off("connection", onConnection);
			server.off("close", onClose);
			server.off("error", onError);
		}

		server.on("connection", onConnection);
		server.once("close", onClose);
		server.once("error", onError);

		return Effect.sync(() => {
			cleanup();
		});
	});
});

export type { Server };
