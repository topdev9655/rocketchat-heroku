import type { Db, DeleteResult, IndexDescription } from 'mongodb';
import { eventTypes } from '@rocket.chat/core-typings';
import type { IRoom, ISubscription, IUser, IFederationEvent } from '@rocket.chat/core-typings';
import type { IFederationRoomEventsModel } from '@rocket.chat/model-typings';

import { FederationEventsModel } from './FederationEvents';
import { contextDefinitions } from '../../../app/federation/server/lib/context';

const { type, contextQuery } = contextDefinitions.ROOM;

export class FederationRoomEvents extends FederationEventsModel implements IFederationRoomEventsModel {
	constructor(db: Db) {
		super(db, 'federation_room_events');
	}

	protected modelIndexes(): IndexDescription[] {
		return [{ key: { 'context.roomId': 1 } }];
	}

	// @ts-expect-error - TODO: Bad extends
	async createGenesisEvent(origin: string, room: IRoom): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createGenesisEvent(origin, contextQuery(room._id), { contextType: type, room });
	}

	async createDeleteRoomEvent(origin: string, roomId: string): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_DELETE, { roomId });
	}

	async createAddUserEvent(
		origin: string,
		roomId: string,
		user: IUser,
		subscription: ISubscription,
		domainsAfterAdd: string[],
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_ADD_USER, {
			roomId,
			user,
			subscription,
			domainsAfterAdd,
		});
	}

	async createRemoveUserEvent(
		origin: string,
		roomId: string,
		user: IUser,
		domainsAfterRemoval: string[],
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_REMOVE_USER, {
			roomId,
			user,
			domainsAfterRemoval,
		});
	}

	async createUserLeftEvent(
		origin: string,
		roomId: string,
		user: IUser,
		domainsAfterLeave: string[],
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_USER_LEFT, {
			roomId,
			user,
			domainsAfterLeave,
		});
	}

	async createMessageEvent(origin: string, roomId: string, message: string): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_MESSAGE, { message });
	}

	async createEditMessageEvent(
		origin: string,
		roomId: string,
		originalMessage: { _id: string; msg: string; federation: Record<string, unknown> },
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		const message = {
			_id: originalMessage._id,
			msg: originalMessage.msg,
			federation: originalMessage.federation,
		};

		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_EDIT_MESSAGE, {
			message,
		});
	}

	async createDeleteMessageEvent(origin: string, roomId: string, messageId: string): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_DELETE_MESSAGE, {
			roomId,
			messageId,
		});
	}

	async createSetMessageReactionEvent(
		origin: string,
		roomId: string,
		messageId: string,
		username: string,
		reaction: string,
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_SET_MESSAGE_REACTION, {
			roomId,
			messageId,
			username,
			reaction,
		});
	}

	async createUnsetMessageReactionEvent(
		origin: string,
		roomId: string,
		messageId: string,
		username: string,
		reaction: string,
	): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_UNSET_MESSAGE_REACTION, {
			roomId,
			messageId,
			username,
			reaction,
		});
	}

	async createMuteUserEvent(origin: string, roomId: string, user: IUser): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_MUTE_USER, {
			roomId,
			user,
		});
	}

	async createUnmuteUserEvent(origin: string, roomId: string, user: IUser): Promise<Omit<IFederationEvent, '_updatedAt'>> {
		return super.createEvent(origin, contextQuery(roomId), eventTypes.ROOM_UNMUTE_USER, {
			roomId,
			user,
		});
	}

	async removeRoomEvents(roomId: string): Promise<DeleteResult> {
		return super.removeContextEvents(contextQuery(roomId));
	}
}
