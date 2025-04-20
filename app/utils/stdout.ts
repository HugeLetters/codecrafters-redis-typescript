import { color } from "bun";

function ansiColor(colorName: string) {
	return color(colorName, "ansi");
}

function coloredMessage(color: string, message: unknown) {
	return `${ansiColor(color)}${message}\x1b[0m`;
}

export function red(message: unknown) {
	return coloredMessage("red", message);
}

export function green(message: unknown) {
	return coloredMessage("limegreen", message);
}
