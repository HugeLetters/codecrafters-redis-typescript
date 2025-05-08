import { Schema } from "effect";
import { Log } from "../utils";

export function LeftoverData<TType, TEncoded, TReq>(
	schema: Schema.Schema<TType, TEncoded, TReq>,
) {
	return Schema.Struct({ data: schema, leftover: Schema.String });
}

export type LeftoverData<T> = ReturnType<
	typeof LeftoverData<T, string, never>
>["Type"];

export function noLeftover<TType, TEncoded>(
	getLeftover: (value: TType) => string,
	identifier: string,
) {
	return Schema.filter<Schema.Schema<TType, TEncoded>>(
		(data) => {
			const leftover = getLeftover(data);
			if (leftover === "") {
				return;
			}

			const received = Log.received(leftover);
			return `Leftover data must be empty. Received ${received}`;
		},
		{ identifier },
	);
}
