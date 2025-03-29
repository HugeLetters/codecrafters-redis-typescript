import { createServer } from "node:net";

const server = createServer((connection) => {
	//   // Handle connection
});

server.listen(6379, "127.0.0.1");
