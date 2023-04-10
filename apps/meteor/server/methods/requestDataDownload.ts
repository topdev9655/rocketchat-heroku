import path, { join } from 'path';
import { mkdir, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';

import { Meteor } from 'meteor/meteor';
import { ExportOperations, UserDataFiles } from '@rocket.chat/models';
import type { IExportOperation } from '@rocket.chat/core-typings';
import type { ServerMethods } from '@rocket.chat/ui-contexts';

import { settings } from '../../app/settings/server';
import * as dataExport from '../lib/dataExport';

declare module '@rocket.chat/ui-contexts' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		requestDataDownload(params: { fullExport?: boolean }): Promise<{
			requested: boolean;
			exportOperation: IExportOperation;
			url: string | null;
			pendingOperationsBeforeMyRequest: number;
		}>;
	}
}

Meteor.methods<ServerMethods>({
	async requestDataDownload({ fullExport = false }) {
		const currentUserData = await Meteor.userAsync();

		if (!currentUserData) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user');
		}

		const userId = currentUserData._id;

		const lastOperation = await ExportOperations.findLastOperationByUser(userId, fullExport);
		const requestDay = lastOperation ? lastOperation.createdAt : new Date();
		const pendingOperationsBeforeMyRequestCount = await ExportOperations.findAllPendingBeforeMyRequest(requestDay).count();

		if (lastOperation) {
			const yesterday = new Date();
			yesterday.setUTCDate(yesterday.getUTCDate() - 1);

			if (lastOperation.createdAt > yesterday) {
				if (lastOperation.status === 'completed') {
					const file = lastOperation.fileId
						? await UserDataFiles.findOneById(lastOperation.fileId)
						: await UserDataFiles.findLastFileByUser(userId);
					if (file) {
						return {
							requested: false,
							exportOperation: lastOperation,
							url: dataExport.getPath(file._id),
							pendingOperationsBeforeMyRequest: pendingOperationsBeforeMyRequestCount,
						};
					}
				}

				return {
					requested: false,
					exportOperation: lastOperation,
					url: null,
					pendingOperationsBeforeMyRequest: pendingOperationsBeforeMyRequestCount,
				};
			}
		}

		const tempFolder = settings.get<string | undefined>('UserData_FileSystemPath')?.trim() || (await mkdtemp(join(tmpdir(), 'userData')));
		await mkdir(tempFolder, { recursive: true });

		const exportOperation = {
			status: 'preparing',
			userId: currentUserData._id,
			roomList: undefined,
			fileList: [],
			generatedFile: undefined,
			fullExport,
			userData: currentUserData,
		} as unknown as IExportOperation; // @todo yikes!

		const id = await ExportOperations.create(exportOperation);
		exportOperation._id = id;

		const folderName = path.join(tempFolder, id);
		await mkdir(folderName, { recursive: true });

		const assetsFolder = path.join(folderName, 'assets');
		await mkdir(assetsFolder, { recursive: true });

		exportOperation.exportPath = folderName;
		exportOperation.assetsPath = assetsFolder;
		exportOperation.status = 'pending';

		await ExportOperations.updateOperation(exportOperation);

		return {
			requested: true,
			exportOperation,
			url: null,
			pendingOperationsBeforeMyRequest: pendingOperationsBeforeMyRequestCount,
		};
	},
});
