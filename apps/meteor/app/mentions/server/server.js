import { Meteor } from 'meteor/meteor';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import { api } from '@rocket.chat/core-services';
import { Subscriptions, Users, Rooms } from '@rocket.chat/models';

import MentionsServer from './Mentions';
import { settings } from '../../settings/server';
import { callbacks } from '../../../lib/callbacks';

export class MentionQueries {
	async getUsers(usernames) {
		const users = await Users.find(
			{ username: { $in: [...new Set(usernames)] } },
			{ projection: { _id: true, username: true, name: 1 } },
		).toArray();

		return users.map((user) => ({
			...user,
			type: 'user',
		}));
	}

	async getUser(userId) {
		return Users.findOneById(userId);
	}

	getTotalChannelMembers(rid) {
		return Subscriptions.countByRoomId(rid);
	}

	getChannels(channels) {
		return Rooms.find(
			{
				$and: [
					{
						$or: [
							{ $and: [{ $or: [{ federated: { $exists: false } }, { federated: false }], name: { $in: [...new Set(channels)] } }] },
							{ federated: true, fname: { $in: [...new Set(channels)] } },
						],
					},
				],
				t: { $in: ['c', 'p'] },
			},
			{ projection: { _id: 1, name: 1, fname: 1, federated: 1 } },
		).toArray();
	}
}

const queries = new MentionQueries();

const mention = new MentionsServer({
	pattern: () => settings.get('UTF8_User_Names_Validation'),
	messageMaxAll: () => settings.get('Message_MaxAll'),
	getUsers: async (usernames) => queries.getUsers(usernames),
	getUser: async (userId) => queries.getUser(userId),
	getTotalChannelMembers: (rid) => queries.getTotalChannelMembers(rid),
	getChannels: (channels) => queries.getChannels(channels),
	async onMaxRoomMembersExceeded({ sender, rid }) {
		// Get the language of the user for the error notification.
		const { language } = await this.getUser(sender._id);
		const msg = TAPi18n.__('Group_mentions_disabled_x_members', { total: this.messageMaxAll }, language);

		void api.broadcast('notify.ephemeralMessage', sender._id, rid, {
			msg,
		});

		// Also throw to stop propagation of 'sendMessage'.
		throw new Meteor.Error('error-action-not-allowed', msg, {
			method: 'filterATAllTag',
			action: msg,
		});
	},
});
callbacks.add('beforeSaveMessage', async (message) => mention.execute(message), callbacks.priority.HIGH, 'mentions');
