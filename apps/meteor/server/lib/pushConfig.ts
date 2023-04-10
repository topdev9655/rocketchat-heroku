import { Meteor } from 'meteor/meteor';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import type { ServerMethods } from '@rocket.chat/ui-contexts';
import { AppsTokens } from '@rocket.chat/models';

import { getWorkspaceAccessToken } from '../../app/cloud/server';
import { hasPermissionAsync } from '../../app/authorization/server/functions/hasPermission';
import { settings } from '../../app/settings/server';
import { Push } from '../../app/push/server';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		push_test(): { message: string; params: number[] };
	}
}

Meteor.methods<ServerMethods>({
	async push_test() {
		const user = await Meteor.userAsync();

		if (!user) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'push_test',
			});
		}

		if (!(await hasPermissionAsync(user._id, 'test-admin-options'))) {
			throw new Meteor.Error('error-not-allowed', 'Not allowed', {
				method: 'push_test',
			});
		}

		if (settings.get('Push_enable') !== true) {
			throw new Meteor.Error('error-push-disabled', 'Push is disabled', {
				method: 'push_test',
			});
		}

		const query = {
			$and: [
				{
					userId: user._id,
				},
				{
					$or: [
						{
							'token.apn': {
								$exists: true,
							},
						},
						{
							'token.gcm': {
								$exists: true,
							},
						},
					],
				},
			],
		};

		const tokens = await AppsTokens.col.countDocuments(query);

		if (tokens === 0) {
			throw new Meteor.Error('error-no-tokens-for-this-user', 'There are no tokens for this user', {
				method: 'push_test',
			});
		}

		await Push.send({
			from: 'push',
			title: `@${user.username}`,
			text: TAPi18n.__('This_is_a_push_test_messsage'),
			apn: {
				text: `@${user.username}:\n${TAPi18n.__('This_is_a_push_test_messsage')}`,
			},
			sound: 'default',
			userId: user._id,
		});

		return {
			message: 'Your_push_was_sent_to_s_devices',
			params: [tokens],
		};
	},
});

settings.watch<boolean>('Push_enable', async function (enabled) {
	if (!enabled) {
		return;
	}
	const gateways =
		settings.get('Push_enable_gateway') && settings.get('Register_Server') && settings.get('Cloud_Service_Agree_PrivacyTerms')
			? settings.get<string>('Push_gateway').split('\n')
			: undefined;

	let apn:
		| {
				apiKey?: string;
				passphrase: string;
				key: string;
				cert: string;
				gateway?: string;
		  }
		| undefined;
	let gcm:
		| {
				apiKey: string;
				projectNumber: string;
		  }
		| undefined;

	if (!gateways) {
		gcm = {
			apiKey: settings.get('Push_gcm_api_key'),
			projectNumber: settings.get('Push_gcm_project_number'),
		};

		apn = {
			passphrase: settings.get('Push_apn_passphrase'),
			key: settings.get('Push_apn_key'),
			cert: settings.get('Push_apn_cert'),
		};

		if (settings.get('Push_production') !== true) {
			apn = {
				passphrase: settings.get('Push_apn_dev_passphrase'),
				key: settings.get('Push_apn_dev_key'),
				cert: settings.get('Push_apn_dev_cert'),
				gateway: 'gateway.sandbox.push.apple.com',
			};
		}

		if (!apn.key || apn.key.trim() === '' || !apn.cert || apn.cert.trim() === '') {
			apn = undefined;
		}

		if (!gcm.apiKey || gcm.apiKey.trim() === '' || !gcm.projectNumber || gcm.projectNumber.trim() === '') {
			gcm = undefined;
		}
	}

	Push.configure({
		apn,
		gcm,
		production: settings.get('Push_production'),
		gateways,
		uniqueId: settings.get('uniqueID'),
		async getAuthorization() {
			return `Bearer ${await getWorkspaceAccessToken()}`;
		},
	});
});
