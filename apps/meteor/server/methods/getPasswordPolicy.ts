import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import type { ServerMethods, TranslationKey } from '@rocket.chat/ui-contexts';
import { Users } from '@rocket.chat/models';

import { passwordPolicy } from '../../app/lib/server';
import { methodDeprecationLogger } from '../../app/lib/server/lib/deprecationWarningLogger';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		getPasswordPolicy(params: { token: string }): {
			enabled: boolean;
			policy: [name: TranslationKey, options?: Record<string, unknown>][];
		};
	}
}

Meteor.methods<ServerMethods>({
	async getPasswordPolicy(params) {
		methodDeprecationLogger.warn('getPasswordPolicy is deprecated and will be removed in future versions of Rocket.Chat');

		check(params, { token: String });

		const user = await Users.findOne({ 'services.password.reset.token': params.token });
		if (!user && !Meteor.userId()) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'getPasswordPolicy',
			});
		}
		return passwordPolicy.getPasswordPolicy();
	},
});
