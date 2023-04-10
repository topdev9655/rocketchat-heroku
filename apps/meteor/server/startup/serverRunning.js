import fs from 'fs';
import path from 'path';

import semver from 'semver';
import { Meteor } from 'meteor/meteor';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import { Users } from '@rocket.chat/models';

import { settings } from '../../app/settings/server';
import { Info, getMongoInfo } from '../../app/utils/server';
import { sendMessagesToAdmins } from '../lib/sendMessagesToAdmins';
import { showErrorBox, showWarningBox, showSuccessBox } from '../lib/logger/showBox';
import { isRunningMs } from '../lib/isRunningMs';

const exitIfNotBypassed = (ignore, errorCode = 1) => {
	if (typeof ignore === 'string' && ['yes', 'true'].includes(ignore.toLowerCase())) {
		return;
	}

	process.exit(errorCode);
};

const skipMongoDbDeprecationCheck = ['yes', 'true'].includes(String(process.env.SKIP_MONGODEPRECATION_CHECK).toLowerCase());

Meteor.startup(async function () {
	const { oplogEnabled, mongoVersion, mongoStorageEngine } = await getMongoInfo();

	const desiredNodeVersion = semver.clean(fs.readFileSync(path.join(process.cwd(), '../../.node_version.txt')).toString());
	const desiredNodeVersionMajor = String(semver.parse(desiredNodeVersion).major);

	return Meteor.setTimeout(async function () {
		const replicaSet = isRunningMs() ? 'Not required (running micro services)' : `${oplogEnabled ? 'Enabled' : 'Disabled'}`;

		let msg = [
			`Rocket.Chat Version: ${Info.version}`,
			`     NodeJS Version: ${process.versions.node} - ${process.arch}`,
			`    MongoDB Version: ${mongoVersion}`,
			`     MongoDB Engine: ${mongoStorageEngine}`,
			`           Platform: ${process.platform}`,
			`       Process Port: ${process.env.PORT}`,
			`           Site URL: ${settings.get('Site_Url')}`,
			`   ReplicaSet OpLog: ${replicaSet}`,
		];

		if (Info.commit && Info.commit.hash) {
			msg.push(`        Commit Hash: ${Info.commit.hash.substr(0, 10)}`);
		}

		if (Info.commit && Info.commit.branch) {
			msg.push(`      Commit Branch: ${Info.commit.branch}`);
		}

		msg = msg.join('\n');

		if (!isRunningMs() && !oplogEnabled) {
			msg += [
				'',
				'',
				'OPLOG / REPLICASET IS REQUIRED TO RUN ROCKET.CHAT, MORE INFORMATION AT:',
				'https://go.rocket.chat/i/oplog-required',
			].join('\n');
			showErrorBox('SERVER ERROR', msg);

			exitIfNotBypassed(process.env.BYPASS_OPLOG_VALIDATION);
		}

		if (!semver.satisfies(process.versions.node, desiredNodeVersionMajor)) {
			msg += [
				'',
				'',
				'YOUR CURRENT NODEJS VERSION IS NOT SUPPORTED,',
				`PLEASE UPGRADE / DOWNGRADE TO VERSION ${desiredNodeVersionMajor}.X.X`,
			].join('\n');
			showErrorBox('SERVER ERROR', msg);

			exitIfNotBypassed(process.env.BYPASS_NODEJS_VALIDATION);
		}

		if (!semver.satisfies(semver.coerce(mongoVersion), '>=4.4.0')) {
			msg += ['', '', 'YOUR CURRENT MONGODB VERSION IS NOT SUPPORTED,', 'PLEASE UPGRADE TO VERSION 4.4 OR LATER'].join('\n');
			showErrorBox('SERVER ERROR', msg);

			exitIfNotBypassed(process.env.BYPASS_MONGO_VALIDATION);
		}

		showSuccessBox('SERVER RUNNING', msg);

		// Deprecation
		if (!skipMongoDbDeprecationCheck && !semver.satisfies(semver.coerce(mongoVersion), '>=5.0.0')) {
			msg = [
				`YOUR CURRENT MONGODB VERSION (${mongoVersion}) IS DEPRECATED.`,
				'IT WILL NOT BE SUPPORTED ON ROCKET.CHAT VERSION 7.0.0 AND GREATER,',
				'PLEASE UPGRADE MONGODB TO VERSION 5.0 OR GREATER',
			].join('\n');
			showWarningBox('DEPRECATION', msg);

			const id = `mongodbDeprecation_${mongoVersion.replace(/[^0-9]/g, '_')}`;
			const title = 'MongoDB_Deprecated';
			const text = 'MongoDB_version_s_is_deprecated_please_upgrade_your_installation';
			const link = 'https://go.rocket.chat/i/mongodb-deprecated';

			if (!(await Users.bannerExistsById(id))) {
				sendMessagesToAdmins({
					msgs: async ({ adminUser }) => [
						{
							msg: `*${TAPi18n.__(title, adminUser.language)}*\n${TAPi18n.__(text, mongoVersion, adminUser.language)}\n${link}`,
						},
					],
					banners: [
						{
							id,
							priority: 100,
							title,
							text,
							textArguments: [mongoVersion],
							modifiers: ['danger'],
							link,
						},
					],
				});
			}
		}
	}, 100);
});
