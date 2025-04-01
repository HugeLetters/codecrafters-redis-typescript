import { Console, Data, Effect, Stream } from "effect";
import type { Socket } from "node:net";

export function acquireSocket(s: Socket) {
	const connectedSocket = ensureConnectedSocket(s);

	return Effect.acquireRelease(connectedSocket, (s) => {
		if (s.readyState === "closed") {
			return Console.log("Socket already closed");
		}

		return Effect.async((resume) => {
			const closeLog = Console.log("Socket closed");
			s.end(() => Effect.void.pipe(Effect.tap(closeLog), resume));
		});
	});
}

function ensureConnectedSocket(s: Socket) {
	const result = Effect.succeed(s);
	if (s.readyState === "open") {
		const message = "Socket already open";
		return result.pipe(Effect.tap(Console.log(message)));
	}

	return Effect.async<Socket>((resume) => {
		if (s.readyState === "open") {
			const message = "Socket already open";
			result.pipe(Effect.tap(Console.log(message)), resume);
			return;
		}

		s.once("connect", () => {
			const message = "Socket connected";
			result.pipe(Effect.tap(Console.log(message)), resume);
		});
	});
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
