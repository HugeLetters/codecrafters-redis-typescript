import { Resp } from "$/resp";

export namespace Protocol {
	export const Schema = Resp.V2.RespValue;
	export type Schema = typeof Schema;

	export type Decoded = Schema["Type"];
	export type Encoded = Schema["Encoded"];

	// biome-ignore lint/suspicious/noShadowRestrictedNames: its namespaced
	export const Error = Resp.Error;
	export type Error = Resp.Error;

	export function format(value: Decoded): string {
		return Resp.V2.format(value);
	}
}
