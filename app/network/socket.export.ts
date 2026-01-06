export {
	createSocketResource as createResource,
	handleSocketMessages as handleMessages,
	request,
	type Socket,
	type SocketInput as Message,
	type SocketWriteError as Error,
	startSocket as start,
	waitForMessage,
	writeToSocket as write,
} from "./socket";
