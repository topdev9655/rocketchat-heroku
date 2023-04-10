import fs from 'fs';

import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import type { IUpload } from '@rocket.chat/core-typings';

import { UploadFS } from '.';

export async function ufsComplete(fileId: string, storeName: string): Promise<IUpload> {
	check(fileId, String);
	check(storeName, String);

	// Get store
	const store = UploadFS.getStore(storeName);
	if (!store) {
		throw new Meteor.Error('invalid-store', 'Store not found');
	}

	const tmpFile = UploadFS.getTempFilePath(fileId);

	const removeTempFile = function () {
		fs.stat(tmpFile, (err) => {
			!err &&
				fs.unlink(tmpFile, (err2) => {
					err2 && console.error(`ufs: cannot delete temp file "${tmpFile}" (${err2.message})`);
				});
		});
	};

	return new Promise(async (resolve, reject) => {
		try {
			// todo check if temp file exists

			// Get file
			const file = await store.getCollection().findOne({ _id: fileId });

			if (!file) {
				throw new Meteor.Error('invalid-file', 'File is not valid');
			}

			// Validate file before moving to the store
			await store.validate(file);

			// Get the temp file
			const rs = fs.createReadStream(tmpFile, {
				flags: 'r',
				encoding: undefined,
				autoClose: true,
			});

			// Clean upload if error occurs
			rs.on('error', function (err) {
				console.error(err);
				void store.removeById(fileId);
				reject(err);
			});

			// Save file in the store
			await store.write(rs, fileId, function (err, file) {
				removeTempFile();

				if (err) {
					return reject(err);
				}
				if (!file) {
					return reject(new Error('Unknown error writing file'));
				}
				resolve(file);
			});
		} catch (err: any) {
			// If write failed, remove the file
			await store.removeById(fileId);
			// removeTempFile(); // todo remove temp file on error or try again ?
			throw new Meteor.Error('ufs: cannot upload file', err);
		}
	});
}
