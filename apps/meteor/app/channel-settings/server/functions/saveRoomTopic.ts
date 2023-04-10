import { Meteor } from 'meteor/meteor';
import { Match } from 'meteor/check';
import { Rooms } from '@rocket.chat/models';
import { Message } from '@rocket.chat/core-services';

import { callbacks } from '../../../../lib/callbacks';

export const saveRoomTopic = async function (
	rid: string,
	roomTopic: string | undefined,
	user: {
		username: string;
		_id: string;
	},
	sendMessage = true,
) {
	if (!Match.test(rid, String)) {
		throw new Meteor.Error('invalid-room', 'Invalid room', {
			function: 'RocketChat.saveRoomTopic',
		});
	}

	const update = await Rooms.setTopicById(rid, roomTopic);
	if (update && sendMessage) {
		await Message.saveSystemMessage('room_changed_topic', rid, roomTopic || '', user);
	}
	callbacks.run('afterRoomTopicChange', { rid, topic: roomTopic });
	return update;
};
