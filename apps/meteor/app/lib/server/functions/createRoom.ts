import { AppsEngineException } from '@rocket.chat/apps-engine/definition/exceptions';
import { Meteor } from 'meteor/meteor';
import type { ICreatedRoom, IUser, IRoom, RoomType } from '@rocket.chat/core-typings';
import { Message, Team } from '@rocket.chat/core-services';
import type { ICreateRoomParams, ISubscriptionExtraData } from '@rocket.chat/core-services';
import { Rooms, Subscriptions, Users } from '@rocket.chat/models';

import { Apps } from '../../../../ee/server/apps';
import { addUserRolesAsync } from '../../../../server/lib/roles/addUserRoles';
import { callbacks } from '../../../../lib/callbacks';
import { getValidRoomName } from '../../../utils/server';
import { createDirectRoom } from './createDirectRoom';

const isValidName = (name: unknown): name is string => {
	return typeof name === 'string' && name.trim().length > 0;
};

const onlyUsernames = (members: unknown): members is string[] =>
	Array.isArray(members) && members.every((member) => typeof member === 'string');

// eslint-disable-next-line complexity
export const createRoom = async <T extends RoomType>(
	type: T,
	name: T extends 'd' ? undefined : string,
	ownerUsername: string | undefined,
	members: T extends 'd' ? IUser[] : string[] = [],
	readOnly?: boolean,
	roomExtraData?: Partial<IRoom>,
	options?: ICreateRoomParams['options'],
): Promise<
	ICreatedRoom & {
		rid: string;
	}
> => {
	const { teamId, ...extraData } = roomExtraData || ({} as IRoom);
	callbacks.run('beforeCreateRoom', { type, name, owner: ownerUsername, members, readOnly, extraData, options });
	if (type === 'd') {
		return createDirectRoom(members as IUser[], extraData, { ...options, creator: options?.creator || ownerUsername });
	}

	if (!onlyUsernames(members)) {
		throw new Meteor.Error(
			'error-invalid-members',
			'members should be an array of usernames if provided for rooms other than direct messages',
		);
	}

	if (!isValidName(name)) {
		throw new Meteor.Error('error-invalid-name', 'Invalid name', {
			function: 'RocketChat.createRoom',
		});
	}

	if (!ownerUsername) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', {
			function: 'RocketChat.createRoom',
		});
	}

	const owner = await Users.findOneByUsernameIgnoringCase(ownerUsername, { projection: { username: 1 } });

	if (!ownerUsername || !owner) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', {
			function: 'RocketChat.createRoom',
		});
	}

	if (owner.username && !members.includes(owner.username)) {
		members.push(owner.username);
	}

	if (extraData.broadcast) {
		readOnly = true;
		delete extraData.reactWhenReadOnly;
	}

	const now = new Date();

	const roomProps: Omit<IRoom, '_id' | '_updatedAt'> = {
		fname: name,
		_updatedAt: now,
		...extraData,
		name: await getValidRoomName(name.trim(), undefined, {
			...(options?.nameValidationRegex && { nameValidationRegex: options.nameValidationRegex }),
		}),
		t: type,
		msgs: 0,
		usersCount: 0,
		u: {
			_id: owner._id,
			username: owner.username,
		},
		ts: now,
		ro: readOnly === true,
	};

	if (teamId) {
		const team = await Team.getOneById(teamId, { projection: { _id: 1 } });
		if (team) {
			roomProps.teamId = team._id;
		}
	}

	const tmp = {
		...roomProps,
		_USERNAMES: members,
	};

	const prevent = await Apps.triggerEvent('IPreRoomCreatePrevent', tmp).catch((error) => {
		if (error.name === AppsEngineException.name) {
			throw new Meteor.Error('error-app-prevented', error.message);
		}

		throw error;
	});

	if (prevent) {
		throw new Meteor.Error('error-app-prevented', 'A Rocket.Chat App prevented the room creation.');
	}

	const eventResult = await Apps.triggerEvent('IPreRoomCreateModify', await Apps.triggerEvent('IPreRoomCreateExtend', tmp));

	if (eventResult && typeof eventResult === 'object' && delete eventResult._USERNAMES) {
		Object.assign(roomProps, eventResult);
	}

	if (type === 'c') {
		callbacks.run('beforeCreateChannel', owner, roomProps);
	}
	const room = await Rooms.createWithFullRoomData(roomProps);
	const shouldBeHandledByFederation = room.federated === true || ownerUsername.includes(':');
	if (shouldBeHandledByFederation) {
		const extra: Partial<ISubscriptionExtraData> = options?.subscriptionExtra || {};
		extra.open = true;
		extra.ls = now;

		if (room.prid) {
			extra.prid = room.prid;
		}

		await Subscriptions.createWithRoomAndUser(room, owner, extra);
	} else {
		for await (const username of [...new Set(members)]) {
			const member = await Users.findOneByUsername(username, {
				projection: { 'username': 1, 'settings.preferences': 1, 'federated': 1 },
			});
			if (!member) {
				continue;
			}

			try {
				callbacks.run('federation.beforeAddUserToARoom', { user: member, inviter: owner }, room);
			} catch (error) {
				continue;
			}

			const extra: Partial<ISubscriptionExtraData> = options?.subscriptionExtra || {};

			extra.open = true;

			if (room.prid) {
				extra.prid = room.prid;
			}

			if (username === owner.username) {
				extra.ls = now;
			}

			await Subscriptions.createWithRoomAndUser(room, member, extra);
		}
	}

	await addUserRolesAsync(owner._id, ['owner'], room._id);

	if (type === 'c') {
		if (room.teamId) {
			const team = await Team.getOneById(room.teamId);
			if (team) {
				await Message.saveSystemMessage('user-added-room-to-team', team.roomId, room.name || '', owner);
			}
		}
		callbacks.run('afterCreateChannel', owner, room);
	} else if (type === 'p') {
		callbacks.runAsync('afterCreatePrivateGroup', owner, room);
	}
	callbacks.runAsync('afterCreateRoom', owner, room);
	if (shouldBeHandledByFederation) {
		callbacks.runAsync('federation.afterCreateFederatedRoom', room, { owner, originalMemberList: members });
	}

	void Apps.triggerEvent('IPostRoomCreate', room);

	return {
		rid: room._id, // backwards compatible
		inserted: true,
		...room,
	};
};
