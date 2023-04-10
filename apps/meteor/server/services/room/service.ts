import type { IRoom, IUser } from '@rocket.chat/core-typings';
import { Users } from '@rocket.chat/models';
import { ServiceClassInternal, Authorization } from '@rocket.chat/core-services';
import type { ICreateRoomParams, IRoomService } from '@rocket.chat/core-services';

import { createRoom } from '../../../app/lib/server/functions/createRoom'; // TODO remove this import
import { createDirectMessage } from '../../methods/createDirectMessage';

export class RoomService extends ServiceClassInternal implements IRoomService {
	protected name = 'room';

	async create(uid: string, params: ICreateRoomParams): Promise<IRoom> {
		const { type, name, members = [], readOnly, extraData, options } = params;

		const hasPermission = await Authorization.hasPermission(uid, `create-${type}`);
		if (!hasPermission) {
			throw new Error('no-permission');
		}

		const user = await Users.findOneById<Pick<IUser, 'username'>>(uid, {
			projection: { username: 1 },
		});
		if (!user?.username) {
			throw new Error('User not found');
		}

		// TODO convert `createRoom` function to "raw" and move to here
		return createRoom(type, name, user.username, members, readOnly, extraData, options) as unknown as IRoom;
	}

	async createDirectMessage({ to, from }: { to: string; from: string }): Promise<{ rid: string }> {
		const [toUser, fromUser] = await Promise.all([
			Users.findOneById(to, { projection: { username: 1 } }),
			Users.findOneById(from, { projection: { _id: 1 } }),
		]);

		if (!toUser || !fromUser) {
			throw new Error('error-invalid-user');
		}
		return createDirectMessage([toUser.username], fromUser._id);
	}

	async addMember(uid: string, rid: string): Promise<boolean> {
		const hasPermission = await Authorization.hasPermission(uid, 'add-user-to-joined-room', rid);
		if (!hasPermission) {
			throw new Error('no-permission');
		}

		return true;
	}
}
