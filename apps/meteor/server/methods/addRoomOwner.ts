import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { api, Message, Team } from '@rocket.chat/core-services';
import type { IRoom, IUser } from '@rocket.chat/core-typings';
import { isRoomFederated } from '@rocket.chat/core-typings';
import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { Subscriptions, Rooms, Users } from '@rocket.chat/models';

import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';
import { settings } from '../../app/settings/server';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		addRoomOwner(rid: IRoom['_id'], userId: IUser['_id']): boolean;
	}
}

Meteor.methods<ServerMethods>({
	async addRoomOwner(rid, userId) {
		check(rid, String);
		check(userId, String);

		const uid = Meteor.userId();

		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'addRoomOwner',
			});
		}

		const room = await Rooms.findOneById(rid, { projection: { t: 1, federated: 1 } });
		if (!room) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', {
				method: 'addRoomOwner',
			});
		}

		if (!(await hasPermissionAsync(uid, 'set-owner', rid)) && !isRoomFederated(room)) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'addRoomOwner',
			});
		}

		const user = await Users.findOneById(userId);

		if (!user?.username) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'addRoomOwner',
			});
		}

		const subscription = await Subscriptions.findOneByRoomIdAndUserId(rid, user._id);

		if (!subscription) {
			throw new Meteor.Error('error-user-not-in-room', 'User is not in this room', {
				method: 'addRoomOwner',
			});
		}

		if (subscription.roles && Array.isArray(subscription.roles) === true && subscription.roles.includes('owner') === true) {
			throw new Meteor.Error('error-user-already-owner', 'User is already an owner', {
				method: 'addRoomOwner',
			});
		}

		await Subscriptions.addRoleById(subscription._id, 'owner');

		const fromUser = await Users.findOneById(uid);
		if (!fromUser) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'addRoomLeader',
			});
		}

		await Message.saveSystemMessage('subscription-role-added', rid, user.username, fromUser, { role: 'owner' });

		const team = await Team.getOneByMainRoomId(rid);
		if (team) {
			await Team.addRolesToMember(team._id, userId, ['owner']);
		}
		const event = {
			type: 'added',
			_id: 'owner',
			u: {
				_id: user._id,
				username: user.username,
				name: user.name,
			},
			scope: rid,
		};
		if (settings.get('UI_DisplayRoles')) {
			void api.broadcast('user.roleUpdate', event);
		}
		void api.broadcast('federation.userRoleChanged', { ...event, givenByUserId: uid });

		return true;
	},
});
