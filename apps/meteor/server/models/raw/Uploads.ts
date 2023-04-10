// TODO: Lib imports should not exists inside the raw models
import type { IUpload, RocketChatRecordDeleted } from '@rocket.chat/core-typings';
import type { FindPaginated, IUploadsModel } from '@rocket.chat/model-typings';
import type { Collection, FindCursor, Db, IndexDescription, WithId, Filter, FindOptions } from 'mongodb';
import { escapeRegExp } from '@rocket.chat/string-helpers';

import { BaseUploadModelRaw } from './BaseUploadModel';

export class UploadsRaw extends BaseUploadModelRaw implements IUploadsModel {
	constructor(db: Db, trash?: Collection<RocketChatRecordDeleted<IUpload>>) {
		super(db, 'uploads', trash);
	}

	protected modelIndexes(): IndexDescription[] {
		return [...super.modelIndexes(), { key: { uploadedAt: -1 } }, { key: { rid: 1, _hidden: 1, typeGroup: 1 } }];
	}

	findNotHiddenFilesOfRoom(roomId: string, searchText: string, fileType: string, limit: number): FindCursor<IUpload> {
		const fileQuery = {
			rid: roomId,
			complete: true,
			uploading: false,
			_hidden: {
				$ne: true,
			},

			...(searchText && { name: { $regex: new RegExp(escapeRegExp(searchText), 'i') } }),
			...(fileType && fileType !== 'all' && { typeGroup: fileType }),
		};

		return this.find(fileQuery, {
			limit,
			sort: {
				uploadedAt: -1,
			},
			projection: {
				_id: 1,
				userId: 1,
				rid: 1,
				name: 1,
				description: 1,
				type: 1,
				url: 1,
				uploadedAt: 1,
				typeGroup: 1,
			},
		});
	}

	findPaginatedWithoutThumbs(query: Filter<IUpload> = {}, options?: FindOptions<IUpload>): FindPaginated<FindCursor<WithId<IUpload>>> {
		return this.findPaginated(
			{
				...query,
				_hidden: { $ne: true },
				typeGroup: { $ne: 'thumb' },
			},
			options,
		);
	}
}
