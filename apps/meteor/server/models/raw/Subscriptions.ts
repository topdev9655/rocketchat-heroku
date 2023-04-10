import { escapeRegExp } from '@rocket.chat/string-helpers';
import type { IRole, IRoom, ISubscription, IUser, RocketChatRecordDeleted, RoomType, SpotlightUser } from '@rocket.chat/core-typings';
import type { ISubscriptionsModel } from '@rocket.chat/model-typings';
import type {
	Collection,
	FindCursor,
	Db,
	Filter,
	FindOptions,
	UpdateResult,
	DeleteResult,
	Document,
	AggregateOptions,
	IndexDescription,
	UpdateFilter,
	InsertOneResult,
} from 'mongodb';
import { Rooms, Users } from '@rocket.chat/models';
import { compact } from 'lodash';
import mem from 'mem';

import { BaseRaw } from './BaseRaw';
import { getDefaultSubscriptionPref } from '../../../app/utils/lib/getDefaultSubscriptionPref';

export class SubscriptionsRaw extends BaseRaw<ISubscription> implements ISubscriptionsModel {
	constructor(db: Db, trash?: Collection<RocketChatRecordDeleted<ISubscription>>) {
		super(db, 'subscription', trash);
	}

	protected modelIndexes(): IndexDescription[] {
		// Add all indexes from constructor to here
		return [
			{ key: { E2EKey: 1 }, unique: true, sparse: true },
			{ key: { 'rid': 1, 'u._id': 1 }, unique: true },
			{ key: { 'rid': 1, 'u._id': 1, 'open': 1 } },
			{ key: { 'rid': 1, 'u.username': 1 } },
			{ key: { 'rid': 1, 'alert': 1, 'u._id': 1 } },
			{ key: { rid: 1, roles: 1 } },
			{ key: { 'u._id': 1, 'name': 1, 't': 1 } },
			{ key: { name: 1, t: 1 } },
			{ key: { open: 1 } },
			{ key: { alert: 1 } },
			{ key: { ts: 1 } },
			{ key: { ls: 1 } },
			{ key: { desktopNotifications: 1 }, sparse: true },
			{ key: { mobilePushNotifications: 1 }, sparse: true },
			{ key: { emailNotifications: 1 }, sparse: true },
			{ key: { autoTranslate: 1 }, sparse: true },
			{ key: { autoTranslateLanguage: 1 }, sparse: true },
			{ key: { 'userHighlights.0': 1 }, sparse: true },
			{ key: { prid: 1 } },
			{ key: { 'u._id': 1, 'open': 1, 'department': 1 } },
			{ key: { rid: 1 } },
			{ key: { rid: 1, ls: 1 } },
		];
	}

	async getBadgeCount(uid: string): Promise<number> {
		const [result] = await this.col
			.aggregate<{ total: number }>([
				{ $match: { 'u._id': uid, 'archived': { $ne: true } } },
				{
					$group: {
						_id: 'total',
						total: { $sum: '$unread' },
					},
				},
			])
			.toArray();

		return result?.total || 0;
	}

	findOneByRoomIdAndUserId(rid: string, uid: string, options: FindOptions<ISubscription> = {}): Promise<ISubscription | null> {
		const query = {
			rid,
			'u._id': uid,
		};

		return this.findOne(query, options);
	}

	findByUserIdAndRoomIds(userId: string, roomIds: Array<string>, options: FindOptions<ISubscription> = {}): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			'rid': {
				$in: roomIds,
			},
		};

		return this.find(query, options);
	}

	findByRoomId(roomId: string, options: FindOptions<ISubscription> = {}): FindCursor<ISubscription> {
		const query = {
			rid: roomId,
		};

		return this.find(query, options);
	}

	findUnarchivedByRoomId(roomId: string, options: FindOptions<ISubscription> = {}): FindCursor<ISubscription> {
		const query = {
			'rid': roomId,
			'archived': { $ne: true },
			'u._id': { $exists: true },
		};

		return this.find(query, options);
	}

	findByRoomIdAndNotUserId(roomId: string, userId: string, options: FindOptions<ISubscription> = {}): FindCursor<ISubscription> {
		const query = {
			'rid': roomId,
			'u._id': {
				$ne: userId,
			},
		};

		return this.find(query, options);
	}

	countByRoomIdAndNotUserId(rid: string, uid: string): Promise<number> {
		const query = {
			rid,
			'u._id': {
				$ne: uid,
			},
		};

		return this.col.countDocuments(query);
	}

	findByLivechatRoomIdAndNotUserId(roomId: string, userId: string, options: FindOptions<ISubscription> = {}): FindCursor<ISubscription> {
		const query = {
			'rid': roomId,
			'servedBy._id': {
				$ne: userId,
			},
		};

		return this.find(query, options);
	}

	countByRoomIdAndUserId(rid: string, uid: string | undefined): Promise<number> {
		const query = {
			rid,
			'u._id': uid,
		};

		return this.col.countDocuments(query);
	}

	countUnarchivedByRoomId(rid: string): Promise<number> {
		const query = {
			rid,
			'archived': { $ne: true },
			'u._id': { $exists: true },
		};
		return this.col.countDocuments(query);
	}

	async isUserInRole(uid: IUser['_id'], roleId: IRole['_id'], rid?: IRoom['_id']): Promise<boolean> {
		if (rid == null) {
			return false;
		}

		const query = {
			'u._id': uid,
			rid,
			'roles': roleId,
		};

		return !!(await this.findOne(query, { projection: { _id: 1 } }));
	}

	setAsReadByRoomIdAndUserId(
		rid: string,
		uid: string,
		readThreads = false,
		alert = false,
		options: FindOptions<ISubscription> = {},
	): ReturnType<BaseRaw<ISubscription>['update']> {
		const query: Filter<ISubscription> = {
			rid,
			'u._id': uid,
		};

		const update = {
			...(readThreads && {
				$unset: {
					tunread: 1,
					tunreadUser: 1,
					tunreadGroup: 1,
				} as const,
			}),
			$set: {
				open: true,
				alert,
				unread: 0,
				userMentions: 0,
				groupMentions: 0,
				ls: new Date(),
			},
		};

		return this.updateOne(query, update, options);
	}

	removeRolesByUserId(uid: IUser['_id'], roles: IRole['_id'][], rid: IRoom['_id']): Promise<UpdateResult> {
		const query = {
			'u._id': uid,
			rid,
		};

		const update = {
			$pullAll: {
				roles,
			},
		};

		return this.updateOne(query, update);
	}

	findUsersInRoles(roles: IRole['_id'][], rid: string | undefined): Promise<FindCursor<IUser>>;

	findUsersInRoles(roles: IRole['_id'][], rid: string | undefined, options: FindOptions<IUser>): Promise<FindCursor<IUser>>;

	findUsersInRoles<P extends Document = IUser>(
		roles: IRole['_id'][],
		rid: string | undefined,
		options: FindOptions<P extends IUser ? IUser : P>,
	): Promise<FindCursor<P>>;

	async findUsersInRoles<P extends Document = IUser>(
		roles: IRole['_id'][],
		rid: IRoom['_id'] | undefined,
		options?: FindOptions<P extends IUser ? IUser : P>,
	): Promise<FindCursor<P>> {
		const query = {
			roles: { $in: roles },
			...(rid && { rid }),
		};

		const subscriptions = await this.find(query, { projection: { 'u._id': 1 } }).toArray();

		const users = compact(subscriptions.map((subscription) => subscription.u?._id).filter(Boolean));

		// TODO remove dependency to other models - this logic should be inside a function/service
		return Users.find<P>({ _id: { $in: users } }, options || {});
	}

	addRolesByUserId(uid: IUser['_id'], roles: IRole['_id'][], rid?: IRoom['_id']): Promise<UpdateResult> {
		if (!Array.isArray(roles)) {
			roles = [roles];
			process.env.NODE_ENV === 'development' && console.warn('[WARN] Subscriptions.addRolesByUserId: roles should be an array');
		}

		const query = {
			'u._id': uid,
			rid,
		};

		const update = {
			$addToSet: {
				roles: { $each: roles },
			},
		};

		return this.updateOne(query, update);
	}

	async isUserInRoleScope(uid: IUser['_id'], rid?: IRoom['_id']): Promise<boolean> {
		const query = {
			'u._id': uid,
			rid,
		};

		if (!rid) {
			return false;
		}
		const options = {
			projection: { _id: 1 },
		};

		const found = await this.findOne(query, options);
		return !!found;
	}

	async updateAllRoomTypesByRoomId(roomId: IRoom['_id'], roomType: RoomType): Promise<void> {
		await this.updateMany({ rid: roomId }, { $set: { t: roomType } });
	}

	async updateAllRoomNamesByRoomId(roomId: IRoom['_id'], name: string, fname: string): Promise<void> {
		await this.updateMany({ rid: roomId }, { $set: { name, fname } });
	}

	findByRolesAndRoomId({ roles, rid }: { roles: string; rid?: string }, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		return this.find(
			{
				roles,
				...(rid && { rid }),
			},
			options || {},
		);
	}

	findByUserIdAndTypes(userId: string, types: ISubscription['t'][], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			't': {
				$in: types,
			},
		};

		return this.find(query, options || {});
	}

	async removeByRoomId(roomId: string): Promise<number> {
		const query = {
			rid: roomId,
		};

		const result = (await this.deleteMany(query)).deletedCount;

		if (typeof result === 'number' && result > 0) {
			await Rooms.incUsersCountByIds([roomId], -result);
		}

		await Users.removeRoomByRoomId(roomId);

		return result;
	}

	async findConnectedUsersExcept(
		userId: string,
		searchTerm: string,
		exceptions: string[],
		searchFields: string[],
		extraConditions: Filter<IUser>,
		limit: number,
		roomType?: ISubscription['t'],
		{ startsWith = false, endsWith = false }: { startsWith?: string | false; endsWith?: string | false } = {},
		options: AggregateOptions = {},
	): Promise<SpotlightUser[]> {
		const termRegex = new RegExp((startsWith ? '^' : '') + escapeRegExp(searchTerm) + (endsWith ? '$' : ''), 'i');
		const orStatement = searchFields.reduce(function (acc, el) {
			acc.push({ [el.trim()]: termRegex });
			return acc;
		}, [] as { [x: string]: RegExp }[]);

		return this.col
			.aggregate<SpotlightUser>(
				[
					// Match all subscriptions of the requester
					{
						$match: {
							'u._id': userId,
							...(roomType ? { t: roomType } : {}),
						},
					},
					// Group by room id and drop all other subcription data
					{
						$group: {
							_id: '$rid',
						},
					},
					// find all subscriptions to the same rooms by other users
					{
						$lookup: {
							from: 'rocketchat_subscription',
							as: 'subscription',
							let: {
								rid: '$_id',
							},
							pipeline: [{ $match: { '$expr': { $eq: ['$rid', '$$rid'] }, 'u._id': { $ne: userId } } }],
						},
					},
					// Unwind the subscription so we have a separate document for each
					{
						$unwind: {
							path: '$subscription',
						},
					},
					// Group the data by user id, keeping track of how many documents each user had
					{
						$group: {
							_id: '$subscription.u._id',
							score: {
								$sum: 1,
							},
						},
					},
					// Load the data for the subscription's user, ignoring those who don't match the search terms
					{
						$lookup: {
							from: 'users',
							as: 'user',
							let: { id: '$_id' },
							pipeline: [
								{
									$match: {
										$expr: { $eq: ['$_id', '$$id'] },
										...extraConditions,
										active: true,
										username: {
											$exists: true,
											...(exceptions.length > 0 && { $nin: exceptions }),
										},
										...(searchTerm && orStatement.length > 0 && { $or: orStatement }),
									},
								},
							],
						},
					},
					// Discard documents that didn't load any user data in the previous step:
					{
						$unwind: {
							path: '$user',
						},
					},
					// Use group to organize the data at the same time that we pick what to project to the end result
					{
						$group: {
							_id: '$_id',
							score: {
								$sum: '$score',
							},
							name: { $first: '$user.name' },
							username: { $first: '$user.username' },
							nickname: { $first: '$user.nickname' },
							status: { $first: '$user.status' },
							statusText: { $first: '$user.statusText' },
							avatarETag: { $first: '$user.avatarETag' },
						},
					},
					// Sort by score
					{
						$sort: {
							score: -1,
						},
					},
					// Limit the number of results
					{
						$limit: limit,
					},
				],
				options,
			)
			.toArray();
	}

	incUnreadForRoomIdExcludingUserIds(roomId: IRoom['_id'], userIds: IUser['_id'][], inc: number): Promise<UpdateResult | Document> {
		if (inc == null) {
			inc = 1;
		}
		const query = {
			'rid': roomId,
			'u._id': {
				$nin: userIds,
			},
		};

		const update = {
			$set: {
				alert: true,
				open: true,
			},
			$inc: {
				unread: inc,
			},
		};

		return this.updateMany(query, update);
	}

	setAlertForRoomIdExcludingUserId(roomId: IRoom['_id'], userId: IUser['_id']): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': {
				$ne: userId,
			},
			'alert': { $ne: true },
		};

		const update = {
			$set: {
				alert: true,
			},
		};
		return this.updateMany(query, update);
	}

	setOpenForRoomIdExcludingUserId(roomId: IRoom['_id'], userId: IUser['_id']): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': {
				$ne: userId,
			},
			'open': { $ne: true },
		};

		const update = {
			$set: {
				open: true,
			},
		};
		return this.updateMany(query, update);
	}

	updateNameAndFnameByRoomId(roomId: string, name: string, fname: string): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update = {
			$set: {
				name,
				fname,
			},
		};

		return this.updateMany(query, update);
	}

	async setGroupE2EKey(_id: string, key: string): Promise<ISubscription | null> {
		const query = { _id };
		const update = { $set: { E2EKey: key } };
		await this.updateOne(query, update);
		return this.findOneById(_id);
	}

	setGroupE2ESuggestedKey(_id: string, key: string): Promise<UpdateResult | Document> {
		const query = { _id };
		const update = { $set: { E2ESuggestedKey: key } };
		return this.updateOne(query, update);
	}

	unsetGroupE2ESuggestedKey(_id: string): Promise<UpdateResult | Document> {
		const query = { _id };
		return this.updateOne(query, { $unset: { E2ESuggestedKey: 1 } });
	}

	findByRoomIds(roomIds: string[]): FindCursor<ISubscription> {
		const query = {
			rid: {
				$in: roomIds,
			},
		};
		const options = {
			projection: {
				'u._id': 1,
				'rid': 1,
			},
		};

		return this.find(query, options);
	}

	removeByVisitorToken(token: string): Promise<DeleteResult> {
		const query = {
			'v.token': token,
		};

		return this.deleteMany(query);
	}

	updateAutoTranslateById(_id: string, autoTranslate: boolean): Promise<UpdateResult> {
		const query = {
			_id,
		};

		let update: UpdateFilter<ISubscription>;
		if (autoTranslate) {
			update = {
				$set: {
					autoTranslate,
				},
			};
		} else {
			update = {
				$unset: {
					autoTranslate: 1,
				},
			};
		}

		return this.updateOne(query, update);
	}

	updateAutoTranslateLanguageById(_id: string, autoTranslateLanguage: string): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				autoTranslateLanguage,
			},
		};

		return this.updateOne(query, update);
	}

	getAutoTranslateLanguagesByRoomAndNotUser(rid: string, userId: string): Promise<(string | undefined)[]> {
		const query = {
			rid,
			'u._id': { $ne: userId },
			'autoTranslate': true,
		};
		return this.col.distinct('autoTranslateLanguage', query);
	}

	/**
	 * @param {string} userId
	 * @param {string} scope the value for the role scope (room id)
	 */
	roleBaseQuery(userId: string, scope?: string): Filter<ISubscription> | void {
		if (scope == null) {
			return;
		}

		const query = { 'u._id': userId, ...(scope !== undefined && { rid: scope }) };
		return query;
	}

	findByRidWithoutE2EKey(rid: string, options: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			rid,
			E2EKey: {
				$exists: false,
			},
		};

		return this.find(query, options);
	}

	updateAudioNotificationValueById(_id: string, audioNotificationValue: string): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				audioNotificationValue,
			},
		};

		return this.updateOne(query, update);
	}

	clearAudioNotificationValueById(_id: string): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$unset: {
				audioNotificationValue: 1,
			},
		};

		return this.updateOne(query, update);
	}

	updateNotificationsPrefById(
		_id: string,
		notificationPref: { value: number; origin: string } | null,
		notificationField: keyof ISubscription,
		notificationPrefOrigin: keyof ISubscription,
	): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {};

		if (notificationPref === null) {
			update.$unset = {
				[notificationField]: 1,
				[notificationPrefOrigin]: 1,
			};
		} else {
			// @ts-expect-error TODO: fix this
			update.$set = {
				[notificationField]: notificationPref.value,
				[notificationPrefOrigin]: notificationPref.origin,
			};
		}

		return this.updateOne(query, update);
	}

	updateUnreadAlertById(_id: string, unreadAlert: ISubscription['unreadAlert']): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				unreadAlert,
			},
		};

		return this.updateOne(query, update);
	}

	updateDisableNotificationsById(_id: string, disableNotifications: boolean): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				disableNotifications,
			},
		};

		return this.updateOne(query, update);
	}

	updateHideUnreadStatusById(_id: string, hideUnreadStatus: boolean): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			...(hideUnreadStatus === true ? { $set: { hideUnreadStatus } } : { $unset: { hideUnreadStatus: 1 } }),
		};

		return this.updateOne(query, update);
	}

	updateHideMentionStatusById(_id: string, hideMentionStatus: boolean): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> =
			hideMentionStatus === true
				? {
						$set: {
							hideMentionStatus,
						},
				  }
				: {
						$unset: {
							hideMentionStatus: 1,
						},
				  };

		return this.updateOne(query, update);
	}

	updateMuteGroupMentions(_id: string, muteGroupMentions: boolean): Promise<UpdateResult> {
		const query = {
			_id,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				muteGroupMentions,
			},
		};

		return this.updateOne(query, update);
	}

	changeDepartmentByRoomId(rid: string, department: string): Promise<UpdateResult> {
		const query = {
			rid,
		};
		const update: UpdateFilter<ISubscription> = {
			$set: {
				department,
			},
		};

		return this.updateOne(query, update);
	}

	findAlwaysNotifyDesktopUsersByRoomId(roomId: string): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			rid: roomId,
			desktopNotifications: 'all',
		};

		return this.find(query);
	}

	findDontNotifyDesktopUsersByRoomId(roomId: string): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			rid: roomId,
			desktopNotifications: 'nothing',
		};

		return this.find(query);
	}

	findAlwaysNotifyMobileUsersByRoomId(roomId: string): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			rid: roomId,
			mobilePushNotifications: 'all',
		};

		return this.find(query);
	}

	findDontNotifyMobileUsersByRoomId(roomId: string): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			rid: roomId,
			mobilePushNotifications: 'nothing',
		};

		return this.find(query);
	}

	findWithSendEmailByRoomId(roomId: string): FindCursor<ISubscription> {
		const query = {
			rid: roomId,
			emailNotifications: {
				$exists: true,
			},
		};

		return this.find(query, { projection: { emailNotifications: 1, u: 1 } });
	}

	resetUserE2EKey(userId: string): Promise<UpdateResult | Document> {
		return this.updateMany(
			{ 'u._id': userId },
			{
				$unset: {
					E2EKey: '',
				},
			},
		);
	}

	findByUserIdWithoutE2E(userId: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			'E2EKey': {
				$exists: false,
			},
		};

		return this.find(query, options);
	}

	findOneByRoomIdAndUsername(roomId: string, username: string, options: FindOptions<ISubscription>): Promise<ISubscription | null> {
		const query = {
			'rid': roomId,
			'u.username': username,
		};

		return this.findOne(query, options);
	}

	findOneByRoomNameAndUserId(roomName: string, userId: string): Promise<ISubscription | null> {
		const query = {
			'name': roomName,
			'u._id': userId,
		};

		return this.findOne(query);
	}

	// FIND
	findByUserId(userId: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = { 'u._id': userId };

		return this.find(query, options);
	}

	cachedFindByUserId = mem(this.findByUserId.bind(this), { maxAge: 5000 });

	findByUserIdExceptType(
		userId: string,
		typeException: ISubscription['t'],
		options?: FindOptions<ISubscription>,
	): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			'u._id': userId,
			't': { $ne: typeException },
		};

		return this.find(query, options);
	}

	findByUserIdAndType(userId: string, type: ISubscription['t'], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			'u._id': userId,
			't': type,
		};

		return this.find(query, options);
	}

	/**
	 * @param {IUser['_id']} userId
	 * @param {IRole['_id'][]} roles
	 * @param {any} options
	 */
	findByUserIdAndRoles(userId: string, roles: string[], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			'roles': { $in: roles },
		};

		return this.find(query, options);
	}

	findByUserIdUpdatedAfter(userId: string, updatedAt: Date, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			'_updatedAt': {
				$gt: updatedAt,
			},
		};

		return this.find(query, options);
	}

	/**
	 * @param {string} roomId
	 * @param {IRole['_id'][]} roles the list of roles
	 * @param {any} options
	 */
	findByRoomIdAndRoles(roomId: string, roles: string[], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		roles = ([] as string[]).concat(roles);
		const query = {
			rid: roomId,
			roles: { $in: roles },
		};

		return this.find(query, options);
	}

	countByRoomIdAndRoles(roomId: string, roles: string[]): Promise<number> {
		roles = ([] as string[]).concat(roles);
		const query = {
			rid: roomId,
			roles: { $in: roles },
		};

		return this.col.countDocuments(query);
	}

	countByRoomId(roomId: string): Promise<number> {
		const query = {
			rid: roomId,
		};

		return this.col.countDocuments(query);
	}

	findByType(types: ISubscription['t'][], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			t: {
				$in: types,
			},
		};

		return this.find(query, options);
	}

	findByTypeAndUserId(type: ISubscription['t'], userId: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query: Filter<ISubscription> = {
			't': type,
			'u._id': userId,
		};

		return this.find(query, options);
	}

	findByRoomWithUserHighlights(roomId: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'rid': roomId,
			'userHighlights.0': { $exists: true },
		};

		return this.find(query, options);
	}

	async getLastSeen(options: FindOptions<ISubscription> = { projection: { _id: 0, ls: 1 } }): Promise<Date | undefined> {
		options.sort = { ls: -1 };
		options.limit = 1;
		const [subscription] = await this.find({}, options).toArray();
		return subscription?.ls;
	}

	findByRoomIdAndUserIds(roomId: string, userIds: string[], options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = {
			'rid': roomId,
			'u._id': {
				$in: userIds,
			},
		};

		return this.find(query, options);
	}

	findByRoomIdAndUserIdsOrAllMessages(roomId: string, userIds: string[]): FindCursor<ISubscription> {
		const query = {
			rid: roomId,
			$or: [{ 'u._id': { $in: userIds } }, { emailNotifications: 'all' }],
		};

		return this.find(query);
	}

	findByRoomIdWhenUserIdExists(rid: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = { rid, 'u._id': { $exists: true } };

		return this.find(query, options);
	}

	findByRoomIdWhenUsernameExists(rid: string, options?: FindOptions<ISubscription>): FindCursor<ISubscription> {
		const query = { rid, 'u.username': { $exists: true } };

		return this.find(query, options);
	}

	countByRoomIdWhenUsernameExists(rid: string): Promise<number> {
		const query = { rid, 'u.username': { $exists: true } };

		return this.col.countDocuments(query);
	}

	findUnreadByUserId(userId: string): FindCursor<ISubscription> {
		const query = {
			'u._id': userId,
			'unread': {
				$gt: 0,
			},
		};

		return this.find(query, { projection: { unread: 1 } });
	}

	getMinimumLastSeenByRoomId(rid: string): Promise<ISubscription | null> {
		return this.findOne(
			{
				rid,
			},
			{
				sort: {
					ls: 1,
				},
				projection: {
					ls: 1,
				},
			},
		);
	}

	// UPDATE
	archiveByRoomId(roomId: string): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: false,
				open: false,
				archived: true,
			},
		};

		return this.updateMany(query, update);
	}

	unarchiveByRoomId(roomId: string): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: false,
				open: true,
				archived: false,
			},
		};

		return this.updateMany(query, update);
	}

	hideByRoomIdAndUserId(roomId: string, userId: string): Promise<UpdateResult> {
		const query = {
			'rid': roomId,
			'u._id': userId,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: false,
				open: false,
			},
		};

		return this.updateOne(query, update);
	}

	setAsUnreadByRoomIdAndUserId(roomId: string, userId: string, firstMessageUnreadTimestamp: Date): Promise<UpdateResult> {
		const query = {
			'rid': roomId,
			'u._id': userId,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				open: true,
				alert: true,
				ls: firstMessageUnreadTimestamp,
			},
		};

		return this.updateOne(query, update);
	}

	setCustomFieldsDirectMessagesByUserId(userId: string, fields: Record<string, any>): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			'u._id': userId,
			't': 'd',
		};
		const update: UpdateFilter<ISubscription> = { $set: { customFields: fields } };

		return this.updateMany(query, update);
	}

	setFavoriteByRoomIdAndUserId(roomId: string, userId: string, favorite?: boolean): Promise<UpdateResult> {
		if (favorite == null) {
			favorite = true;
		}
		const query = {
			'rid': roomId,
			'u._id': userId,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				f: favorite,
			},
		};

		return this.updateOne(query, update);
	}

	updateNameAndAlertByRoomId(roomId: string, name: string, fname: string): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				name,
				fname,
				alert: true,
			},
		};

		return this.updateMany(query, update);
	}

	updateDisplayNameByRoomId(roomId: string, fname: string): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				fname,
				name: fname,
			},
		};

		return this.updateMany(query, update);
	}

	updateFnameByRoomId(rid: string, fname: string): Promise<UpdateResult | Document> {
		const query = { rid };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				fname,
			},
		};

		return this.updateMany(query, update);
	}

	updateNameAndFnameById(_id: string, name: string, fname: string): Promise<UpdateResult | Document> {
		const query = { _id };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				name,
				fname,
			},
		};

		return this.updateMany(query, update);
	}

	setUserUsernameByUserId(userId: string, username: string): Promise<UpdateResult | Document> {
		const query = { 'u._id': userId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				'u.username': username,
			},
		};

		return this.updateMany(query, update);
	}

	setNameForDirectRoomsWithOldName(oldName: string, name: string): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			name: oldName,
			t: 'd',
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				name,
			},
		};

		return this.updateMany(query, update);
	}

	updateDirectNameAndFnameByName(name: string, newName?: string, newFname?: string): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			name,
			t: 'd',
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				...(newName && { name: newName }),
				...(newFname && { fname: newFname }),
			},
		};

		return this.updateMany(query, update);
	}

	incGroupMentionsAndUnreadForRoomIdExcludingUserId(
		roomId: string,
		userId: string,
		incGroup = 1,
		incUnread = 1,
	): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': {
				$ne: userId,
			},
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: true,
				open: true,
			},
			$inc: {
				unread: incUnread,
				groupMentions: incGroup,
			},
		};

		return this.updateMany(query, update);
	}

	incUserMentionsAndUnreadForRoomIdAndUserIds(
		roomId: string,
		userIds: string[],
		incUser = 1,
		incUnread = 1,
	): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': {
				$in: userIds,
			},
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: true,
				open: true,
			},
			$inc: {
				unread: incUnread,
				userMentions: incUser,
			},
		};

		return this.updateMany(query, update);
	}

	ignoreUser({ _id, ignoredUser: ignored, ignore = true }: { _id: string; ignoredUser: string; ignore?: boolean }): Promise<UpdateResult> {
		const query = {
			_id,
		};
		const update: UpdateFilter<ISubscription> = {};
		if (ignore) {
			update.$addToSet = { ignored };
		} else {
			update.$pull = { ignored };
		}

		return this.updateOne(query, update);
	}

	setAlertForRoomIdAndUserIds(roomId: string, uids: string[]): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': { $in: uids },
			'alert': { $ne: true },
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				alert: true,
			},
		};
		return this.updateMany(query, update);
	}

	setOpenForRoomIdAndUserIds(roomId: string, uids: string[]): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': { $in: uids },
			'open': { $ne: true },
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				open: true,
			},
		};
		return this.updateMany(query, update);
	}

	setLastReplyForRoomIdAndUserIds(roomId: string, uids: string, lr: Date): Promise<UpdateResult | Document> {
		const query = {
			'rid': roomId,
			'u._id': { $in: uids },
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				lr,
			},
		};
		return this.updateMany(query, update);
	}

	async setBlockedByRoomId(rid: string, blocked: string, blocker: string): Promise<UpdateResult[]> {
		const query = {
			rid,
			'u._id': blocked,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				blocked: true,
			},
		};

		const query2 = {
			rid,
			'u._id': blocker,
		};

		const update2: UpdateFilter<ISubscription> = {
			$set: {
				blocker: true,
			},
		};

		return Promise.all([this.updateOne(query, update), this.updateOne(query2, update2)]);
	}

	async unsetBlockedByRoomId(rid: string, blocked: string, blocker: string): Promise<UpdateResult[]> {
		const query = {
			rid,
			'u._id': blocked,
		};

		const update: UpdateFilter<ISubscription> = {
			$unset: {
				blocked: 1,
			},
		};

		const query2 = {
			rid,
			'u._id': blocker,
		};

		const update2: UpdateFilter<ISubscription> = {
			$unset: {
				blocker: 1,
			},
		};
		return Promise.all([this.updateOne(query, update), this.updateOne(query2, update2)]);
	}

	updateCustomFieldsByRoomId(rid: string, cfields: Record<string, any>): Promise<UpdateResult | Document> {
		const query = { rid };
		const customFields = cfields || {};
		const update: UpdateFilter<ISubscription> = {
			$set: {
				customFields,
			},
		};

		return this.updateMany(query, update);
	}

	updateTypeByRoomId(roomId: string, type: ISubscription['t']): Promise<UpdateResult | Document> {
		const query = { rid: roomId };

		const update: UpdateFilter<ISubscription> = {
			$set: {
				t: type,
			},
		};

		return this.updateMany(query, update);
	}

	/**
	 * @param {string} _id the subscription id
	 * @param {IRole['_id']} role the id of the role
	 */
	addRoleById(_id: string, role: string): Promise<UpdateResult> {
		const query = { _id };

		const update: UpdateFilter<ISubscription> = {
			$addToSet: {
				roles: role,
			},
		};

		return this.updateOne(query, update);
	}

	/**
	 * @param {string} _id the subscription id
	 * @param {IRole['_id']} role the id of the role
	 */
	removeRoleById(_id: string, role: string): Promise<UpdateResult> {
		const query = { _id };

		const update: UpdateFilter<ISubscription> = {
			$pull: {
				roles: role,
			},
		};

		return this.updateOne(query, update);
	}

	setArchivedByUsername(username: string, archived: boolean): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			t: 'd',
			name: username,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				archived,
			},
		};

		return this.updateMany(query, update);
	}

	clearNotificationUserPreferences(
		userId: string,
		notificationField: string,
		notificationOriginField: string,
	): Promise<UpdateResult | Document> {
		const query = {
			'u._id': userId,
			[notificationOriginField]: 'user',
		};

		const update: UpdateFilter<ISubscription> = {
			$unset: {
				[notificationOriginField]: 1,
				[notificationField]: 1,
			},
		};

		return this.updateMany(query, update);
	}

	updateNotificationUserPreferences(
		userId: string,
		userPref: string | number | boolean,
		notificationField: keyof ISubscription,
		notificationOriginField: keyof ISubscription,
	): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			'u._id': userId,
			[notificationOriginField]: {
				$ne: 'subscription',
			},
		};

		const update: UpdateFilter<ISubscription> = {
			// @ts-expect-error - :(
			$set: {
				[notificationField]: userPref,
				[notificationOriginField]: 'user',
			},
		};

		return this.updateMany(query, update);
	}

	updateUserHighlights(userId: string, userHighlights: any): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			'u._id': userId,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				userHighlights,
			},
		};

		return this.updateMany(query, update);
	}

	updateDirectFNameByName(name: string, fname: string): Promise<UpdateResult | Document> {
		const query: Filter<ISubscription> = {
			t: 'd' as const,
			name,
		};

		let update: UpdateFilter<ISubscription>;
		if (fname) {
			update = {
				$set: {
					fname,
				},
			};
		} else {
			update = {
				$unset: {
					fname: true,
				},
			};
		}

		return this.updateMany(query, update);
	}

	// INSERT
	async createWithRoomAndUser(room: IRoom, user: IUser, extraData: Record<string, any> = {}): Promise<InsertOneResult<ISubscription>> {
		const subscription = {
			open: false,
			alert: false,
			unread: 0,
			userMentions: 0,
			groupMentions: 0,
			ts: room.ts,
			rid: room._id,
			name: room.name,
			fname: room.fname,
			...(room.customFields && { customFields: room.customFields }),
			t: room.t,
			u: {
				_id: user._id,
				username: user.username,
				name: user.name,
			},
			...(room.prid && { prid: room.prid }),
			...getDefaultSubscriptionPref(user),
			...extraData,
		};

		// @ts-expect-error - types not good :(
		const result = await this.insertOne(subscription);

		await Rooms.incUsersCountById(room._id, 1);

		if (!['d', 'l'].includes(room.t)) {
			await Users.addRoomByUserId(user._id, room._id);
		}

		return result;
	}

	// REMOVE
	async removeByUserId(userId: string): Promise<number> {
		const query = {
			'u._id': userId,
		};

		const roomIds = (await this.findByUserId(userId).toArray()).map((s) => s.rid);

		const result = (await this.deleteMany(query)).deletedCount;

		if (typeof result === 'number' && result > 0) {
			await Rooms.incUsersCountNotDMsByIds(roomIds, -1);
		}

		await Users.removeAllRoomsByUserId(userId);

		return result;
	}

	async removeByRoomIdAndUserId(roomId: string, userId: string): Promise<number> {
		const query = {
			'rid': roomId,
			'u._id': userId,
		};

		const result = (await this.deleteMany(query)).deletedCount;

		if (typeof result === 'number' && result > 0) {
			await Rooms.incUsersCountById(roomId, -result);
		}

		await Users.removeRoomByUserId(userId, roomId);

		return result;
	}

	async removeByRoomIds(rids: string[]): Promise<DeleteResult> {
		const result = await this.deleteMany({ rid: { $in: rids } });

		await Users.removeRoomByRoomIds(rids);

		return result;
	}

	async removeByRoomIdsAndUserId(rids: string[], userId: string): Promise<number> {
		const result = (await this.deleteMany({ 'rid': { $in: rids }, 'u._id': userId })).deletedCount;

		if (typeof result === 'number' && result > 0) {
			await Rooms.incUsersCountByIds(rids, -1);
		}

		await Users.removeRoomsByRoomIdsAndUserId(rids, userId);

		return result;
	}

	// //////////////////////////////////////////////////////////////////
	// threads

	async addUnreadThreadByRoomIdAndUserIds(
		rid: string,
		users: string[],
		tmid: string,
		{ groupMention = false, userMention = false }: { groupMention?: boolean; userMention?: boolean } = {},
	): Promise<UpdateResult | Document | void> {
		if (!users) {
			return;
		}

		return this.updateMany(
			{
				'u._id': { $in: users },
				rid,
			},
			{
				$addToSet: {
					tunread: tmid,
					...(groupMention && { tunreadGroup: tmid }),
					...(userMention && { tunreadUser: tmid }),
				},
			},
		);
	}

	removeUnreadThreadByRoomIdAndUserId(rid: string, userId: string, tmid: string, clearAlert = false): Promise<UpdateResult> {
		const update: UpdateFilter<ISubscription> = {
			$pull: {
				tunread: tmid,
				tunreadGroup: tmid,
				tunreadUser: tmid,
			},
		};

		if (clearAlert) {
			update.$set = { alert: false };
		}

		return this.updateOne(
			{
				'u._id': userId,
				rid,
			},
			update,
		);
	}

	removeUnreadThreadsByRoomId(rid: string, tunread: string[]): Promise<UpdateResult | Document> {
		const query = {
			rid,
			tunread: { $in: tunread },
		};

		const update: UpdateFilter<ISubscription> = {
			$pullAll: {
				tunread,
				tunreadUser: tunread,
				tunreadGroup: tunread,
			},
		};

		return this.updateMany(query, update);
	}

	openByRoomIdAndUserId(roomId: string, userId: string): Promise<UpdateResult> {
		const query = {
			'rid': roomId,
			'u._id': userId,
		};

		const update: UpdateFilter<ISubscription> = {
			$set: {
				open: true,
			},
		};

		return this.updateOne(query, update);
	}
}
