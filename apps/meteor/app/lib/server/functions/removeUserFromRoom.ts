/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { AppsEngineException } from '@rocket.chat/apps-engine/definition/exceptions';
import { Meteor } from 'meteor/meteor';
import type { IUser } from '@rocket.chat/core-typings';
import { Message, Team } from '@rocket.chat/core-services';
import { Subscriptions, Rooms } from '@rocket.chat/models';

import { AppEvents, Apps } from '../../../../ee/server/apps';
import { callbacks } from '../../../../lib/callbacks';

export const removeUserFromRoom = async function (
	rid: string,
	user: IUser,
	options?: { byUser: Pick<IUser, '_id' | 'username'> },
): Promise<void> {
	const room = await Rooms.findOneById(rid);

	if (!room) {
		return;
	}

	try {
		await Apps.triggerEvent(AppEvents.IPreRoomUserLeave, room, user);
	} catch (error: any) {
		if (error.name === AppsEngineException.name) {
			throw new Meteor.Error('error-app-prevented', error.message);
		}

		throw error;
	}

	callbacks.run('beforeLeaveRoom', user, room);

	const subscription = await Subscriptions.findOneByRoomIdAndUserId(rid, user._id, {
		projection: { _id: 1 },
	});

	if (subscription) {
		const removedUser = user;
		if (options?.byUser) {
			const extraData = {
				u: options.byUser,
			};

			if (room.teamMain) {
				await Message.saveSystemMessage('removed-user-from-team', rid, user.username || '', user, extraData);
			} else {
				await Message.saveSystemMessage('ru', rid, user.username || '', user, extraData);
			}
		} else if (room.teamMain) {
			await Message.saveSystemMessage('ult', rid, removedUser.username || '', removedUser);
		} else {
			await Message.saveSystemMessage('ul', rid, removedUser.username || '', removedUser);
		}
	}

	if (room.t === 'l') {
		await Message.saveSystemMessage('command', rid, 'survey', user);
	}

	await Subscriptions.removeByRoomIdAndUserId(rid, user._id);

	if (room.teamId && room.teamMain) {
		await Team.removeMember(room.teamId, user._id);
	}

	// TODO: CACHE: maybe a queue?
	callbacks.run('afterLeaveRoom', user, room);

	await Apps.triggerEvent(AppEvents.IPostRoomUserLeave, room, user);
};
