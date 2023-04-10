import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Message, Team } from '@rocket.chat/core-services';
import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { Rooms } from '@rocket.chat/models';

import { methodDeprecationLogger } from '../../app/lib/server/lib/deprecationWarningLogger';
import { deleteRoom } from '../../app/lib/server/functions/deleteRoom';
import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';
import { Apps } from '../../ee/server/apps';
import { roomCoordinator } from '../lib/rooms/roomCoordinator';

export async function eraseRoom(rid: string, uid: string): Promise<void> {
	const room = await Rooms.findOneById(rid);

	if (!room) {
		throw new Meteor.Error('error-invalid-room', 'Invalid room', {
			method: 'eraseRoom',
		});
	}

	if (room.federated) {
		throw new Meteor.Error('error-cannot-delete-federated-room', 'Cannot delete federated room', {
			method: 'eraseRoom',
		});
	}

	if (
		!(await roomCoordinator
			.getRoomDirectives(room.t)
			?.canBeDeleted((permissionId, rid) => hasPermissionAsync(uid, permissionId, rid), room))
	) {
		throw new Meteor.Error('error-not-allowed', 'Not allowed', {
			method: 'eraseRoom',
		});
	}

	if (Apps?.isLoaded()) {
		const prevent = await Apps.getBridges()?.getListenerBridge().roomEvent('IPreRoomDeletePrevent', room);
		if (prevent) {
			throw new Meteor.Error('error-app-prevented-deleting', 'A Rocket.Chat App prevented the room erasing.');
		}
	}

	await deleteRoom(rid);

	const team = room.teamId && (await Team.getOneById(room.teamId));

	if (team) {
		const user = await Meteor.userAsync();
		if (user) {
			await Message.saveSystemMessage('user-deleted-room-from-team', team.roomId, room.name || '', user);
		}
	}

	if (Apps?.isLoaded()) {
		void Apps.getBridges()?.getListenerBridge().roomEvent('IPostRoomDeleted', room);
	}
}

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		eraseRoom(rid: string): Promise<boolean>;
	}
}

Meteor.methods<ServerMethods>({
	async eraseRoom(rid: string) {
		methodDeprecationLogger.warn('eraseRoom is deprecated and will be removed in future versions of Rocket.Chat');

		check(rid, String);

		const uid = Meteor.userId();

		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'eraseRoom',
			});
		}

		await eraseRoom(rid, uid);

		return true;
	},
});
