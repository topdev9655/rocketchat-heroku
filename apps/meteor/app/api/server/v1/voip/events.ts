import { Match, check } from 'meteor/check';
import { VoipClientEvents } from '@rocket.chat/core-typings';
import { VoipRoom } from '@rocket.chat/models';
import { LivechatVoip } from '@rocket.chat/core-services';

import { API } from '../../api';
import { canAccessRoomAsync } from '../../../../authorization/server';

API.v1.addRoute(
	'voip/events',
	{ authRequired: true, permissionsRequired: ['view-l-room'] },
	{
		async post() {
			check(this.bodyParams, {
				event: Match.Where((v: string) => {
					return Object.values<string>(VoipClientEvents).includes(v);
				}),
				rid: String,
				comment: Match.Maybe(String),
			});

			const { rid, event, comment } = this.bodyParams;

			const room = await VoipRoom.findOneVoipRoomById(rid);
			if (!room) {
				return API.v1.notFound();
			}
			if (!(await canAccessRoomAsync(room, this.user))) {
				return API.v1.unauthorized();
			}

			return API.v1.success(await LivechatVoip.handleEvent(event, room, this.user, comment));
		},
	},
);
