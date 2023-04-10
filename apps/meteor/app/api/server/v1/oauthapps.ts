import { isOauthAppsGetParams, isOauthAppsAddParams } from '@rocket.chat/rest-typings';
import { OAuthApps } from '@rocket.chat/models';

import { hasPermissionAsync } from '../../../authorization/server/functions/hasPermission';
import { API } from '../api';
import { addOAuthApp } from '../../../oauth2-server-config/server/admin/functions/addOAuthApp';
import { deprecationWarning } from '../helpers/deprecationWarning';

API.v1.addRoute(
	'oauth-apps.list',
	{ authRequired: true },
	{
		async get() {
			if (!(await hasPermissionAsync(this.userId, 'manage-oauth-apps'))) {
				throw new Error('error-not-allowed');
			}

			return API.v1.success({
				oauthApps: await OAuthApps.find().toArray(),
			});
		},
	},
);

API.v1.addRoute(
	'oauth-apps.get',
	{ authRequired: true, validateParams: isOauthAppsGetParams },
	{
		async get() {
			const oauthApp = await OAuthApps.findOneAuthAppByIdOrClientId(this.queryParams);

			if (!oauthApp) {
				return API.v1.failure('OAuth app not found.');
			}
			if ('appId' in this.queryParams) {
				return API.v1.success(
					deprecationWarning({
						endpoint: 'oauth-apps.get',
						warningMessage: ({ versionWillBeRemoved, endpoint }) =>
							`appId get parameter from "${endpoint}" is deprecated and will be removed after version ${versionWillBeRemoved}. Use _id instead.`,
						response: { oauthApp },
					}),
				);
			}
			return API.v1.success({
				oauthApp,
			});
		},
	},
);

API.v1.addRoute(
	'oauth-apps.create',
	{
		authRequired: true,
		validateParams: isOauthAppsAddParams,
	},
	{
		async post() {
			const application = await addOAuthApp(this.bodyParams, this.userId);

			return API.v1.success({ application });
		},
	},
);
