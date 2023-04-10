import { Avatars, Uploads } from '@rocket.chat/models';
import { Meteor } from 'meteor/meteor';
import type { IMessage, IUpload, IUser } from '@rocket.chat/core-typings';

import { FileUpload } from '../../../../../../app/file-upload/server';
import { parseFileIntoMessageAttachments } from '../../../../../../app/file-upload/server/methods/sendFileMessage';

interface IAvatarMetadataFile {
	type: string;
	name: string;
}

export class RocketChatFileAdapter {
	public async uploadFile(
		readableStream: ReadableStream,
		internalRoomId: string,
		internalUser: IUser,
		fileRecord: Partial<IUpload>,
	): Promise<{ files: IMessage['files']; attachments: IMessage['attachments'] }> {
		return new Promise<{ files: IMessage['files']; attachments: IMessage['attachments'] }>(async (resolve, reject) => {
			const fileStore = FileUpload.getStore('Uploads');
			// this needs to be here due to a high coupling in the third party lib that rely on the logged in user
			await Meteor.runAsUser(internalUser._id, async () => {
				const uploadedFile = await fileStore.insert(fileRecord, readableStream);
				try {
					const { files, attachments } = await parseFileIntoMessageAttachments(uploadedFile, internalRoomId, internalUser);

					resolve({ files, attachments });
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	public async getBufferFromFileRecord(fileRecord: IUpload): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			FileUpload.getBuffer(fileRecord, (err?: Error, buffer?: Buffer | false) => {
				if (err) {
					return reject(err);
				}
				if (!(buffer instanceof Buffer)) {
					return reject(new Error('Unknown error'));
				}
				resolve(buffer);
			});
		});
	}

	public async getFileRecordById(fileId: string): Promise<IUpload | undefined | null> {
		return Uploads.findOneById(fileId);
	}

	public async extractMetadataFromFile(file: IUpload): Promise<{ height?: number; width?: number; format?: string }> {
		if (file.type?.startsWith('image/')) {
			const metadata = await FileUpload.extractMetadata(file);

			return {
				format: metadata.format,
				height: metadata.height,
				width: metadata.width,
			};
		}
		if (file.type?.startsWith('video/')) {
			return {
				height: 200,
				width: 250,
			};
		}
		return {};
	}

	public async getBufferForAvatarFile(username: string): Promise<any> {
		const file = (await Avatars.findOneByName(username)) as Record<string, any>;
		if (!file?._id) {
			return;
		}
		return FileUpload.getBufferSync(file);
	}

	public async getFileMetadataForAvatarFile(username: string): Promise<IAvatarMetadataFile> {
		const file = (await Avatars.findOneByName(username)) as Record<string, any>;

		return {
			type: file.type,
			name: file.name,
		};
	}
}
