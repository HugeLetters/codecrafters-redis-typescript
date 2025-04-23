import { Console, Data, Effect, Stream } from "effect";
import type { Socket } from "node:net";

export function acquireSocket(s: Socket) {
	const socket = Effect.async<Socket>((resume) => {
		if (s.readyState === "open") {
			const log = Console.log("Socket already open");
			return Effect.succeed(s).pipe(Effect.tap(log), resume);
		}

		s.once("connect", () => {
			const log = Console.log("Socket connected");
			Effect.succeed(s).pipe(Effect.tap(log), resume);
		});
	});

	return socket.pipe(
		Effect.acquireRelease((s) => {
			return Effect.async<void>((resume) => {
				if (s.readyState === "closed") {
					const log = Console.log("Socket already closed");
					return Effect.void.pipe(Effect.tap(log), resume);
				}

				const log = Console.log("Socket closed");
				s.end(() => Effect.void.pipe(Effect.tap(log), resume));
			});
		}),
	);
}

export function getSocketWriter(s: Socket) {
	return function (data: string) {
		if (!s.writable) {
			return Effect.fail(new SocketWriteError());
		}

		return Effect.async<void, SocketWriteError>((resume) => {
			s.write(data, (err) => {
				const result = err ? Effect.fail(new SocketWriteError()) : Effect.void;
				resume(result);
			});
		});
	};
}
class SocketWriteError extends Data.TaggedError("SocketWrite") {}

export function getSocketDataStream(s: Socket) {
	return Stream.async<Buffer>((emit) => {
		const dataHandler = (buffer: Buffer) => emit.single(buffer);
		s.on("data", dataHandler);
		s.once("end", () => emit.end());

		return Effect.sync(() => {
			s.off("data", dataHandler);
		});
	});
}
