import * as Arr from "effect/Array";
import * as Fn from "effect/Function";
import { Box, render, Text, useInput, useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";
import { Resp } from "$/schema/resp";
import type { StrictOmit } from "$/utils/type";
import { type Client, createSocket } from "./socket";

function App() {
	const size = useWindowSize();
	const [client, setClient] = useState<Client>();
	const [logs, setLogs] = useState<Array<Log>>([]);
	const truncatedLogs = Arr.takeRight(logs, size.height - 5);
	const [status, setStatus] = useState<string>("Offline");

	const addLog = useCallback((log: StrictOmit<Log, "id">) => {
		setLogs((logs) =>
			Arr.takeRight([...logs, { id: Bun.randomUUIDv7(), ...log }], 500),
		);
	}, []);

	const initClient = useCallback(() => {
		createSocket({
			onError(err) {
				addLog({ type: LogType.ERROR, content: err });
			},
			onClientReady(newClient) {
				setClient(newClient);
			},
			onMessage(message) {
				addLog({ type: LogType.INCOMING, content: Resp.format(message) });
			},
			onStatusChange(status) {
				setStatus(status);
			},
		});
	}, [addLog]);

	useEffect(() => {
		initClient();
	}, [initClient]);

	useEffect(() => {
		addLog({ content: "Press [ctrl+r] to reconnect", type: LogType.INFO });
	}, [addLog]);

	useInput((input) => {
		const command = PRESET_COMMANDS[input];
		if (!command) {
			return;
		}

		const message = command.command();
		addLog({ type: LogType.OUTGOING, content: Resp.format(message) });
		client?.write(message);
	});

	useInput((input, key) => {
		if (input !== "r" || !key.ctrl) {
			return;
		}

		addLog({ type: LogType.INFO, content: "Socket restart" });
		client?.close();
		initClient();
	});

	useInput((input, key) => {
		if (input !== "l" || !key.ctrl) {
			return;
		}

		setLogs([]);
	});

	return (
		<Box flexDirection="column" flexGrow={1} height={size.height}>
			<Box flexGrow={1} overflow="hidden" width="100%">
				<Box
					flexDirection="column"
					borderColor="green"
					borderStyle="single"
					width="100%"
					height="100%"
					overflow="hidden"
				>
					{truncatedLogs.map((log) => {
						return <Log key={log.id} log={log} />;
					})}
				</Box>
			</Box>

			<Box flexShrink={0}>
				<Box
					borderColor={rbgColor("orange")}
					borderStyle="single"
					alignItems="center"
					justifyContent="center"
					width={23}
				>
					<Text>{status}</Text>
				</Box>

				<Box borderColor="green" borderStyle="single" flexGrow={1}>
					{Object.entries(PRESET_COMMANDS).map(([key, command]) => {
						return (
							<Box key={key}>
								<Text>
									[<Text color="yellowBright">{key}</Text>] {command.label}
								</Text>

								<Box width={2} />
							</Box>
						);
					})}
				</Box>
			</Box>
		</Box>
	);
}

interface PresetCommand {
	label: string;
	command: () => Resp.RespValue;
}
const PRESET_COMMANDS: Record<string, PresetCommand> = {
	1: {
		label: "PING",
		command() {
			return ["PING"];
		},
	},
	2: {
		label: "ECHO",
		command() {
			return ["ECHO", Date.now().toString()];
		},
	},

	3: {
		label: "GET",
		command() {
			return ["GET", "key"];
		},
	},
	4: {
		label: "SET",
		command() {
			return ["SET", "key", Date.now().toString(), "PX", 5000];
		},
	},
	5: {
		label: "CONFIG GET",
		command() {
			return ["CONFIG", "GET", "dir"];
		},
	},
};

function useWindowSize() {
	const { stdout } = useStdout();
	const [height, setHeight] = useState(24);
	const [width, setWidth] = useState(80);

	useEffect(() => {
		function onResize() {
			const rows = stdout.rows;
			const columns = stdout.columns;

			setWidth(columns);
			setHeight(rows);
		}

		onResize();
		stdout.addListener("resize", onResize);
		return () => {
			stdout.removeListener("resize", onResize);
		};
	}, [stdout]);

	return { height, width };
}

enum LogType {
	INFO = "INFO",
	ERROR = "ERROR",
	INCOMING = "INCOMING",
	OUTGOING = "OUTGOING",
}
type Log = {
	id: string;
	content: string;
	type: LogType;
};
function rbgColor(value: string) {
	return Bun.color(value, "rgb") ?? undefined;
}
const logTypeColor = Fn.flow(
	function (logType: LogType) {
		switch (logType) {
			case LogType.INFO: {
				return "blue";
			}
			case LogType.ERROR: {
				return "red";
			}
			case LogType.INCOMING: {
				return "chartreuse";
			}
			case LogType.OUTGOING: {
				return "aquamarine";
			}
		}
	},
	rbgColor,
	(color) => color ?? "yellow",
);

function Log(p: { log: Log }) {
	const color = logTypeColor(p.log.type);
	return (
		<Text>
			[<Text color={color}>{p.log.type.toUpperCase()}</Text>] {p.log.content}
		</Text>
	);
}

render(<App />);
