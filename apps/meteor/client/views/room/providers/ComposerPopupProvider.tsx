import type { IRoom } from '@rocket.chat/core-typings';
import { isOmnichannelRoom } from '@rocket.chat/core-typings';
import { escapeRegExp } from '@rocket.chat/string-helpers';
import { useMethod, useSetting, useTranslation } from '@rocket.chat/ui-contexts';
import React, { useMemo } from 'react';
import type { ReactNode } from 'react';

import { hasAtLeastOnePermission } from '../../../../app/authorization/client';
import { emoji, EmojiPicker } from '../../../../app/emoji/client';
import { Subscriptions } from '../../../../app/models/client';
import ComposerPopupCannedResponse from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupCannedResponse';
import type { ComposerBoxPopupEmojiProps } from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupEmoji';
import ComposerPopupEmoji from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupEmoji';
import type { ComposerBoxPopupRoomProps } from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupRoom';
import ComposerBoxPopupRoom from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupRoom';
import type { ComposerBoxPopupSlashCommandProps } from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupSlashCommand';
import ComposerPopupSlashCommand from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupSlashCommand';
import ComposerBoxPopupUser from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupUser';
import type { ComposerBoxPopupUserProps } from '../../../../app/ui-message/client/popup/components/composerBoxPopup/ComposerBoxPopupUser';
import { usersFromRoomMessages } from '../../../../app/ui-message/client/popup/messagePopupConfig';
import { slashCommands } from '../../../../app/utils/client';
import { CannedResponse } from '../../../../ee/app/canned-responses/client/collections/CannedResponse';
import type { ComposerPopupContextValue } from '../contexts/ComposerPopupContext';
import { ComposerPopupContext, createMessageBoxPopupConfig } from '../contexts/ComposerPopupContext';

const ComposerPopupProvider = ({ children, room }: { children: ReactNode; room: IRoom }) => {
	const { _id: rid } = room;
	const userSpotlight = useMethod('spotlight');
	const suggestionsCount = useSetting<number>('Number_of_users_autocomplete_suggestions');
	const cannedResponseEnabled = useSetting<boolean>('Canned_Responses_Enable');
	const isOmnichannel = isOmnichannelRoom(room);

	const t = useTranslation();

	const call = useMethod('getSlashCommandPreviews');
	const value: ComposerPopupContextValue = useMemo(() => {
		return [
			createMessageBoxPopupConfig({
				trigger: '@',
				title: t('People'),
				getItemsFromLocal: async (filter: string) => {
					const filterRegex = filter && new RegExp(escapeRegExp(filter), 'i');
					const items: ComposerBoxPopupUserProps[] = [];

					const users = usersFromRoomMessages
						.find(
							{
								ts: { $exists: true },
								...(filter && {
									$or: [{ username: filterRegex }, { name: filterRegex }],
								}),
							},
							{
								limit: suggestionsCount ?? 5,
								sort: { ts: -1 },
							},
						)
						.fetch()
						.map((u) => {
							u.suggestion = true;
							return u;
						});
					if (!filterRegex || filterRegex.test('all')) {
						items.push({
							_id: 'all',
							username: 'all',
							system: true,
							name: t('Notify_all_in_this_room'),
							sort: 4,
						});
					}

					if (!filterRegex || filterRegex.test('here')) {
						items.push({
							_id: 'here',
							username: 'here',
							system: true,
							name: t('Notify_active_in_this_room'),
							sort: 4,
						});
					}

					return [...users, ...items];
				},
				getItemsFromServer: async (filter: string) => {
					const filterRegex = filter && new RegExp(escapeRegExp(filter), 'i');
					const usernames = usersFromRoomMessages
						.find(
							{
								ts: { $exists: true },
								...(filter && {
									$or: [{ username: filterRegex }, { name: filterRegex }],
								}),
							},
							{
								limit: suggestionsCount ?? 5,
								sort: { ts: -1 },
							},
						)
						.fetch()
						.map((u) => {
							return u.username;
						});
					const { users = [] } = await userSpotlight(filter, usernames, { users: true, mentions: true }, rid);

					return users.map(({ _id, username, nickname, name, status, avatarETag, outside }) => {
						return {
							_id,
							username,
							nickname,
							name,
							status,
							avatarETag,
							outside,
							sort: 3,
						};
					});
				},
				getValue: (item) => item.username,
				renderItem: ({ item }) => <ComposerBoxPopupUser {...item} />,
			}),
			createMessageBoxPopupConfig<ComposerBoxPopupRoomProps>({
				trigger: '#',
				title: t('Channels'),
				getItemsFromLocal: async (filter: string) => {
					const filterRegex = new RegExp(escapeRegExp(filter), 'i');
					const records = Subscriptions.find(
						{
							name: filterRegex,
							$or: [{ federated: { $exists: false } }, { federated: false }],
							t: {
								$in: ['c', 'p'],
							},
						},
						{
							limit: suggestionsCount ?? 5,
							sort: {
								ls: -1,
							},
						},
					).fetch();
					return records;
				},
				getItemsFromServer: async (filter: string) => {
					const { rooms = [] } = await userSpotlight(filter, [], { rooms: true, mentions: true }, rid);
					return rooms as unknown as ComposerBoxPopupRoomProps[];
				},
				getValue: (item) => `${item.name || item.fname}`,
				renderItem: ({ item }) => <ComposerBoxPopupRoom {...item} />,
			}) as any,
			createMessageBoxPopupConfig<ComposerBoxPopupEmojiProps>({
				trigger: ':',
				title: t('Emoji'),
				getItemsFromLocal: async (filter: string) => {
					const exactFinalTone = new RegExp('^tone[1-5]:*$');
					const colorBlind = new RegExp('tone[1-5]:*$');
					const seeColor = new RegExp('_t(?:o|$)(?:n|$)(?:e|$)(?:[1-5]|$)(?::|$)$');

					const emojiSort = (recents: string[]) => (a: { _id: string }, b: { _id: string }) => {
						let idA = a._id;
						let idB = a._id;

						if (recents.includes(a._id)) {
							idA = recents.indexOf(a._id) + idA;
						}
						if (recents.includes(b._id)) {
							idB = recents.indexOf(b._id) + idB;
						}

						if (idA < idB) {
							return -1;
						}

						if (idA > idB) {
							return 1;
						}

						return 0;
					};
					const filterRegex = new RegExp(escapeRegExp(filter), 'i');
					const key = `:${filter}`;

					const recents = EmojiPicker.getRecent().map((item) => `:${item}:`);

					const collection = emoji.list;

					return Object.keys(collection)
						.map((_id) => {
							const data = collection[key];
							return { _id, data };
						})
						.filter(
							({ _id }) =>
								filterRegex.test(_id) && (exactFinalTone.test(_id.substring(key.length)) || seeColor.test(key) || !colorBlind.test(_id)),
						)
						.sort(emojiSort(recents))
						.slice(0, 10);
				},
				getItemsFromServer: async () => {
					return [];
				},
				getValue: (item) => `${item._id.substring(1)}`,
				renderItem: ({ item }) => <ComposerPopupEmoji {...item} />,
			}),
			createMessageBoxPopupConfig<ComposerBoxPopupEmojiProps>({
				title: t('Emoji'),
				trigger: '\\+:',
				prefix: '+',
				suffix: ' ',
				triggerAnywhere: false,
				getItemsFromLocal: async (filter: string) => {
					const exactFinalTone = new RegExp('^tone[1-5]:*$');
					const colorBlind = new RegExp('tone[1-5]:*$');
					const seeColor = new RegExp('_t(?:o|$)(?:n|$)(?:e|$)(?:[1-5]|$)(?::|$)$');

					const emojiSort = (recents: string[]) => (a: { _id: string }, b: { _id: string }) => {
						let idA = a._id;
						let idB = a._id;

						if (recents.includes(a._id)) {
							idA = recents.indexOf(a._id) + idA;
						}
						if (recents.includes(b._id)) {
							idB = recents.indexOf(b._id) + idB;
						}

						if (idA < idB) {
							return -1;
						}

						if (idA > idB) {
							return 1;
						}

						return 0;
					};
					const filterRegex = new RegExp(escapeRegExp(filter), 'i');
					const key = `:${filter}`;

					const recents = EmojiPicker.getRecent().map((item) => `:${item}:`);

					const collection = emoji.list;

					return Object.keys(collection)
						.map((_id) => {
							const data = collection[key];
							return { _id, data };
						})
						.filter(
							({ _id }) =>
								filterRegex.test(_id) && (exactFinalTone.test(_id.substring(key.length)) || seeColor.test(key) || !colorBlind.test(_id)),
						)
						.sort(emojiSort(recents))
						.slice(0, 10);
				},
				getItemsFromServer: async () => {
					return [];
				},
				getValue: (item) => `${item._id}`,
				renderItem: ({ item }) => <ComposerPopupEmoji {...item} />,
			}),

			createMessageBoxPopupConfig<ComposerBoxPopupSlashCommandProps>({
				title: t('Commands'),
				trigger: '/',
				suffix: ' ',
				triggerAnywhere: false,
				renderItem: ({ item }) => <ComposerPopupSlashCommand {...item} />,
				getItemsFromLocal: async (filter: string) => {
					return Object.keys(slashCommands.commands)
						.map((command) => {
							const item = slashCommands.commands[command];
							return {
								_id: command,
								params: item.params && t.has(item.params) ? t(item.params) : item.params ?? '',
								description: t.has(item.description) ? t(item.description) : item.description,
								permission: item.permission,
							};
						})
						.filter((command) => {
							const isMatch = command._id.indexOf(filter) > -1;

							if (!isMatch) {
								return false;
							}

							if (!command.permission) {
								return true;
							}

							return hasAtLeastOnePermission(command.permission, rid);
						})
						.sort((a, b) => a._id.localeCompare(b._id))
						.slice(0, 11);
				},
				getItemsFromServer: async () => [],
			}),
			cannedResponseEnabled &&
				isOmnichannel &&
				createMessageBoxPopupConfig<{
					_id: string;
					text: string;
					shortcut: string;
				}>({
					title: t('Canned_Responses'),
					trigger: '!',
					triggerAnywhere: true,
					renderItem: ({ item }) => <ComposerPopupCannedResponse {...item} />,
					getItemsFromLocal: async (filter: string) => {
						const exp = new RegExp(filter, 'i');
						return CannedResponse.find(
							{
								shortcut: exp,
							},
							{
								limit: 12,
								sort: {
									shortcut: -1,
								},
							},
						)
							.fetch()
							.map((record) => ({
								_id: record._id,
								text: record.text,
								shortcut: record.shortcut,
							}));
					},
					getItemsFromServer: async () => [],
					getValue: (item) => {
						return item.text;
					},
				}),
			createMessageBoxPopupConfig({
				matchSelectorRegex: /(?:^)(\/[\w\d\S]+ )[^]*$/,
				preview: true,
				getItemsFromLocal: async ({ cmd, params, tmid }: { cmd: string; params: string; tmid: string }) => {
					const result = await call({ cmd, params, msg: { rid, tmid } });
					return (
						result?.items.map((item) => ({
							_id: item.id,
							value: item.value,
							type: item.type,
						})) ?? []
					);
				},
			}),
		].filter(Boolean);
	}, [t, cannedResponseEnabled, isOmnichannel, suggestionsCount, userSpotlight, rid, call]);

	return <ComposerPopupContext.Provider value={value} children={children} />;
};

export default ComposerPopupProvider;
