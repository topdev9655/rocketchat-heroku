import { Meteor } from 'meteor/meteor';
import { Random } from '@rocket.chat/random';
import { Match, check } from 'meteor/check';
import { Messages, AppsTokens, Users, Rooms } from '@rocket.chat/models';

import { API } from '../api';
import PushNotification from '../../../push-notifications/server/lib/PushNotification';
import { canAccessRoomAsync } from '../../../authorization/server/functions/canAccessRoom';

API.v1.addRoute(
	'push.token',
	{ authRequired: true },
	{
		async post() {
			const { id, type, value, appName } = this.bodyParams;

			if (id && typeof id !== 'string') {
				throw new Meteor.Error('error-id-param-not-valid', 'The required "id" body param is invalid.');
			}

			const deviceId = id || Random.id();

			if (!type || (type !== 'apn' && type !== 'gcm')) {
				throw new Meteor.Error('error-type-param-not-valid', 'The required "type" body param is missing or invalid.');
			}

			if (!value || typeof value !== 'string') {
				throw new Meteor.Error('error-token-param-not-valid', 'The required "value" body param is missing or invalid.');
			}

			if (!appName || typeof appName !== 'string') {
				throw new Meteor.Error('error-appName-param-not-valid', 'The required "appName" body param is missing or invalid.');
			}

			const result = await Meteor.callAsync('raix:push-update', {
				id: deviceId,
				token: { [type]: value },
				authToken: this.request.headers['x-auth-token'],
				appName,
				userId: this.userId,
			});

			return API.v1.success({ result });
		},
		async delete() {
			const { token } = this.bodyParams;

			if (!token || typeof token !== 'string') {
				throw new Meteor.Error('error-token-param-not-valid', 'The required "token" body param is missing or invalid.');
			}

			const affectedRecords = (
				await AppsTokens.deleteMany({
					$or: [
						{
							'token.apn': token,
						},
						{
							'token.gcm': token,
						},
					],
					userId: this.userId,
				})
			).deletedCount;

			if (affectedRecords === 0) {
				return API.v1.notFound();
			}

			return API.v1.success();
		},
	},
);

API.v1.addRoute(
	'push.get',
	{ authRequired: true },
	{
		async get() {
			const params = this.queryParams;
			check(
				params,
				Match.ObjectIncluding({
					id: String,
				}),
			);

			const receiver = await Users.findOneById(this.userId);
			if (!receiver) {
				throw new Error('error-user-not-found');
			}

			const message = await Messages.findOneById(params.id);
			if (!message) {
				throw new Error('error-message-not-found');
			}

			const room = await Rooms.findOneById(message.rid);
			if (!room) {
				throw new Error('error-room-not-found');
			}

			if (!(await canAccessRoomAsync(room, receiver))) {
				throw new Error('error-not-allowed');
			}

			const data = await PushNotification.getNotificationForMessageId({ receiver, room, message });

			return API.v1.success({ data });
		},
	},
);
