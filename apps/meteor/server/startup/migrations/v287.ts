import { Settings } from '@rocket.chat/models';
import { MongoInternals } from 'meteor/mongo';

import { addMigration } from '../../lib/migrations';
import { upsertPermissions } from '../../../app/authorization/server/functions/upsertPermissions';

addMigration({
	version: 287,
	async up() {
		const deprecatedSettings = [
			'Markdown_Parser',
			'Markdown_Headers',
			'Markdown_SupportSchemesForLink',
			'Markdown_Marked_GFM',
			'Markdown_Marked_Tables',
			'Markdown_Marked_Breaks',
			'Markdown_Marked_Pedantic',
			'Markdown_Marked_SmartLists',
			'Markdown_Marked_Smartypants',
			'Message_AllowSnippeting',
			'Message_Attachments_GroupAttach',
			'Message_ShowEditedStatus',
			'Message_ShowFormattingTips',
			'Accounts_Default_User_Preferences_useLegacyMessageTemplate',
			'AutoLinker',
			'AutoLinker_StripPrefix',
			'AutoLinker_Urls_Scheme',
			'AutoLinker_Urls_www',
			'AutoLinker_Urls_TLD',
			'AutoLinker_UrlsRegExp',
			'AutoLinker_Email',
			'AutoLinker_Phone',
			'IssueLinks_Enabled',
			'IssueLinks_Template',
			'API_EmbedDisabledFor',
		];

		await Settings.deleteMany({
			_id: { $in: deprecatedSettings },
		});

		const { mongo } = MongoInternals.defaultRemoteCollectionDriver();
		const messages = mongo.db.collection('rocketchat_message');

		await messages.updateMany(
			{
				snippeted: true,
			},
			{
				$unset: {
					snippeted: 1,
					snippetedBy: 1,
					snippetedAt: 1,
					snippetName: 1,
				},
			},
		);
		await messages.dropIndex('snippeted_1');

		await upsertPermissions();
	},
});
