import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { AppConfig } from "$/config";
import { AlphanumericAlphabet, randomString } from "$/utils/random";

export namespace Replication {
	export interface MasterData {
		readonly _tag: "master";
		readonly role: "master";
		readonly replicationId: string;
		readonly replicationOffset: Effect.Effect<number>;
	}
	export interface SlaveData {
		readonly _tag: "slave";
		readonly role: "slave";
		readonly replicationOffset: Effect.Effect<number>;
	}
	export type ReplicationData = MasterData | SlaveData;

	export class Replication extends Effect.Service<Replication>()(
		"@codecrafters/redis/app/replication/index/Replication",
		{
			effect: Effect.gen(function* () {
				const config = yield* AppConfig;
				const ReplicationOffset = yield* SynchronizedRef.make(0);

				const data: ReplicationData = yield* Option.match(config.replicaof, {
					onNone: Effect.fn(function* () {
						const replicationId = yield* randomString(AlphanumericAlphabet, 40);

						const res: MasterData = {
							_tag: "master",
							role: "master",
							replicationOffset: ReplicationOffset.get,
							replicationId: replicationId,
						};
						return res;
					}),
					onSome: Effect.fn(function () {
						const res: SlaveData = {
							_tag: "slave",
							role: "slave",
							replicationOffset: ReplicationOffset.get,
						};
						return Effect.succeed(res);
					}),
				});

				return {
					data,
					addReplicationOffset(bytes: number) {
						return SynchronizedRef.update(
							ReplicationOffset,
							(offset) => offset + bytes,
						);
					},
				};
			}),
		},
	) {}
}
