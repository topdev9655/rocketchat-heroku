import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { api, Message, Team } from '@rocket.chat/core-services';
import type { IRoom, IUser } from '@rocket.chat/core-typings';
import { isRoomFederated } from '@rocket.chat/core-typings';
import { Subscriptions, Rooms, Users } from '@rocket.chat/models';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';
import { settings } from '../../app/settings/server';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		removeRoomModerator(rid: IRoom['_id'], userId: IUser['_id']): boolean;
	}
}

Meteor.methods<ServerMethods>({
	async removeRoomModerator(rid, userId) {
		check(rid, String);
		check(userId, String);

		const uid = Meteor.userId();

		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'removeRoomModerator',
			});
		}

		const room = await Rooms.findOneById(rid, { projection: { t: 1, federated: 1 } });
		if (!room) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', {
				method: 'removeRoomModerator',
			});
		}

		if (!(await hasPermissionAsync(uid, 'set-moderator', rid)) && !isRoomFederated(room)) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'removeRoomModerator',
			});
		}

		const user = await Users.findOneById(userId);

		if (!user?.username) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'removeRoomModerator',
			});
		}

		const subscription = await Subscriptions.findOneByRoomIdAndUserId(rid, user._id);

		if (!subscription) {
			throw new Meteor.Error('error-invalid-room', 'Invalid room', {
				method: 'removeRoomModerator',
			});
		}

		if (subscription.roles && (!Array.isArray(subscription.roles) || !subscription.roles.includes('moderator'))) {
			throw new Meteor.Error('error-user-not-moderator', 'User is not a moderator', {
				method: 'removeRoomModerator',
			});
		}

		await Subscriptions.removeRoleById(subscription._id, 'moderator');

		const fromUser = await Users.findOneById(uid);
		if (!fromUser) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'removeRoomModerator',
			});
		}

		await Message.saveSystemMessage('subscription-role-removed', rid, user.username, fromUser, { role: 'moderator' });

		const team = await Team.getOneByMainRoomId(rid);
		if (team) {
			await Team.removeRolesFromMember(team._id, userId, ['moderator']);
		}

		const event = {
			type: 'removed',
			_id: 'moderator',
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
