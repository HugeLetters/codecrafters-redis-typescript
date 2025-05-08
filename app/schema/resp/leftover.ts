import { Schema } from "effect";
import { ParseFailLog } from "../utils";

export type LeftoverData<T> = {
	readonly data: T;
	readonly leftover: string;
};

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

			const received = ParseFailLog.received(leftover);
			return `Leftover data must be empty. Received ${received}`;
		},
		{ identifier },
	);
}
