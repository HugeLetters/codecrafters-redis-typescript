import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AppConfig } from "$/config";
import { AlphanumericAlphabet, randomString } from "$/utils/random";

export namespace Replication {
	export interface MasterData {
		readonly _tag: "master";
		readonly role: "master";
		readonly replicationId: string;
		readonly replicationOffset: number;
	}
	export interface SlaveData {
		readonly _tag: "slave";
		readonly role: "slave";
		readonly replicationOffset: number;
	}
	export type ReplicationData = MasterData | SlaveData;

	export class Service extends Effect.Service<Service>()(
		"@codecrafters/redis/app/replication/index/Service",
		{
			effect: Effect.gen(function* () {
				const config = yield* AppConfig;

				const data: ReplicationData = yield* Option.match(config.replicaof, {
					onNone: Effect.fn(function* () {
						const replicationId = yield* randomString(AlphanumericAlphabet, 40);

						const res: MasterData = {
							_tag: "master",
							role: "master",
							replicationOffset: 0,
							replicationId: replicationId,
						};
						return res;
					}),
					onSome: Effect.fn(function () {
						const res: SlaveData = {
							_tag: "slave",
							role: "slave",
							replicationOffset: 0,
						};
						return Effect.succeed(res);
					}),
				});

				return {
					data,
				};
			}),
		},
	) {}
}
