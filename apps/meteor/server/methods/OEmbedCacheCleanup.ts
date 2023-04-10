import { Meteor } from 'meteor/meteor';
import { OEmbedCache } from '@rocket.chat/models';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { settings } from '../../app/settings/server';
import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		OEmbedCacheCleanup(): { message: string };
	}
}

Meteor.methods<ServerMethods>({
	async OEmbedCacheCleanup() {
		const uid = Meteor.userId();
		if (!uid || !(await hasPermissionAsync(uid, 'clear-oembed-cache'))) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'OEmbedCacheCleanup',
			});
		}

		const date = new Date();
		const expirationDays = settings.get<number>('API_EmbedCacheExpirationDays');
		date.setDate(date.getDate() - expirationDays);
		await OEmbedCache.removeAfterDate(date);
		return {
			message: 'cache_cleared',
		};
	},
});
