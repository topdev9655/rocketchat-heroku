import type { IRoomTypeConfig } from '../../../definition/IRoomTypeConfig';
import type { RoomCoordinator } from '../coordinator';

export function getLivechatRoomType(_coordinator: RoomCoordinator): IRoomTypeConfig {
	return {
		identifier: 'l',
		route: {
			name: 'live',
			path: '/live/:id/:tab?/:context?',
			link({ rid }): Record<string, string> {
				return { id: rid || '' };
			},
		},
	};
}
