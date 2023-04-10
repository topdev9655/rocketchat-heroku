import { Meteor } from 'meteor/meteor';
import { Match } from 'meteor/check';
import { Rooms } from '@rocket.chat/models';
import { Message } from '@rocket.chat/core-services';

export const saveRoomAnnouncement = async function (rid, roomAnnouncement, user, sendMessage = true) {
	if (!Match.test(rid, String)) {
		throw new Meteor.Error('invalid-room', 'Invalid room', {
			function: 'RocketChat.saveRoomAnnouncement',
		});
	}

	let message;
	let announcementDetails;
	if (typeof roomAnnouncement === 'string') {
		message = roomAnnouncement;
	} else {
		({ message, ...announcementDetails } = roomAnnouncement);
	}

	const updated = await Rooms.setAnnouncementById(rid, message, announcementDetails);
	if (updated && sendMessage) {
		await Message.saveSystemMessage('room_changed_announcement', rid, message, user);
	}

	return updated;
};
