import * as Context from "effect/Context";

export const CR = "\r";
export const LF = "\n";
export const CRLF = `${CR}${LF}`;

export const ArrayPrefix = "*";

export class RespConfig extends Context.Reference<RespConfig>()(
	"@codecrafters/redis/app/resp/constants/RespConfig",
	{
		defaultValue() {
			return {
				/** Defines whether encoder will try encoding a string as a Simple string or will immediately encode it as Bulk string */
				shouldTrySimpleStringEncode(value: string, _type: "string" | "error") {
					return value.length <= 10;
				},
			};
		},
	},
) {}
