import { Meteor } from 'meteor/meteor';
import type { IMessage } from '@rocket.chat/core-typings';
import { isQuoteAttachment } from '@rocket.chat/core-typings';
import { Messages } from '@rocket.chat/models';

import { toInternalMessageFormat, toInternalQuoteMessageFormat } from '../converters/to-external-parser-formatter';
import type { FederatedUser } from '../../../domain/FederatedUser';
import type { FederatedRoom } from '../../../domain/FederatedRoom';
import { deleteMessage, sendMessage, updateMessage } from '../../../../../../app/lib/server';
import { getURL } from '../../../../../../app/utils/server';
import { roomCoordinator } from '../../../../../lib/rooms/roomCoordinator';
import { executeSetReaction } from '../../../../../../app/reactions/server/setReaction';

const DEFAULT_EMOJI_TO_REACT_WHEN_RECEIVED_EMOJI_DOES_NOT_EXIST = ':grey_question:';

export class RocketChatMessageAdapter {
	public async sendMessage(
		user: FederatedUser,
		room: FederatedRoom,
		rawMessage: string,
		externalFormattedMessage: string,
		externalEventId: string,
		homeServerDomain: string,
	): Promise<void> {
		await sendMessage(
			user.getInternalReference(),
			{
				federation: { eventId: externalEventId },
				msg: toInternalMessageFormat({
					rawMessage,
					formattedMessage: externalFormattedMessage,
					homeServerDomain,
					senderExternalId: user.getExternalId(),
				}),
			},
			room.getInternalReference(),
		);
	}

	public async sendQuoteMessage(
		user: FederatedUser,
		federatedRoom: FederatedRoom,
		externalFormattedText: string,
		rawMessage: string,
		externalEventId: string,
		messageToReplyTo: IMessage,
		homeServerDomain: string,
	): Promise<void> {
		const room = federatedRoom.getInternalReference();
		await sendMessage(
			user.getInternalReference(),
			{
				federation: { eventId: externalEventId },
				msg: await this.getMessageToReplyToWhenQuoting(
					federatedRoom,
					messageToReplyTo,
					externalFormattedText,
					rawMessage,
					homeServerDomain,
					user,
				),
			},
			room,
		);
	}

	public async editMessage(
		user: FederatedUser,
		newRawMessageText: string,
		newExternalFormattedMessage: string,
		originalMessage: IMessage,
		homeServerDomain: string,
	): Promise<void> {
		const updatedMessage = {
			...originalMessage,
			msg: toInternalMessageFormat({
				rawMessage: newRawMessageText,
				formattedMessage: newExternalFormattedMessage,
				homeServerDomain,
				senderExternalId: user.getExternalId(),
			}),
		};
		await updateMessage(updatedMessage, user.getInternalReference(), originalMessage);
	}

	private async getMessageToReplyToWhenQuoting(
		federatedRoom: FederatedRoom,
		messageToReplyTo: IMessage,
		externalFormattedMessage: string,
		rawMessage: string,
		homeServerDomain: string,
		senderUser: FederatedUser,
	): Promise<string> {
		const room = federatedRoom.getInternalReference();
		const messageToReplyToUrl = getURL(
			`${roomCoordinator.getRouteLink(room.t as string, { rid: room._id, name: room.name })}?msg=${messageToReplyTo._id}`,
			{ full: true },
		);
		return toInternalQuoteMessageFormat({
			messageToReplyToUrl,
			formattedMessage: externalFormattedMessage,
			rawMessage,
			homeServerDomain,
			senderExternalId: senderUser.getExternalId(),
		});
	}

	public async getMessageToEditWhenReplyAndQuote(
		editedMessage: IMessage,
		newExternalFormattedMessage: string,
		newRawMessageText: string,
		homeServerDomain: string,
		senderUser: FederatedUser,
	): Promise<string> {
		const quotedMessageUrl = editedMessage.attachments?.filter(isQuoteAttachment)?.[0]?.message_link;

		return toInternalQuoteMessageFormat({
			messageToReplyToUrl: quotedMessageUrl || '',
			formattedMessage: newExternalFormattedMessage,
			rawMessage: newRawMessageText,
			homeServerDomain,
			senderExternalId: senderUser.getExternalId(),
		});
	}

	public async editQuotedMessage(
		user: FederatedUser,
		newRawMessageText: string,
		newExternalFormattedMessage: string,
		editedMessage: IMessage,
		homeServerDomain: string,
	): Promise<void> {
		const updatedMessage = {
			...editedMessage,
			msg: await this.getMessageToEditWhenReplyAndQuote(
				editedMessage,
				newExternalFormattedMessage,
				newRawMessageText,
				homeServerDomain,
				user,
			),
		};
		await updateMessage(updatedMessage, user.getInternalReference(), editedMessage);
	}

	public async sendFileMessage(
		user: FederatedUser,
		room: FederatedRoom,
		files: IMessage['files'],
		attachments: IMessage['attachments'],
		externalEventId: string,
	): Promise<void> {
		await sendMessage(
			user.getInternalReference(),
			{
				federation: { eventId: externalEventId },
				rid: room.getInternalId(),
				ts: new Date(),
				file: (files || [])[0],
				files,
				attachments,
			},
			room.getInternalReference(),
		);
	}

	public async sendQuoteFileMessage(
		user: FederatedUser,
		federatedRoom: FederatedRoom,
		files: IMessage['files'],
		attachments: IMessage['attachments'],
		externalEventId: string,
		messageToReplyTo: IMessage,
		homeServerDomain: string,
	): Promise<void> {
		const room = federatedRoom.getInternalReference();

		await sendMessage(
			user.getInternalReference(),
			{
				federation: { eventId: externalEventId },
				rid: federatedRoom.getInternalId(),
				ts: new Date(),
				file: (files || [])[0],
				files,
				attachments,
				msg: await this.getMessageToReplyToWhenQuoting(federatedRoom, messageToReplyTo, '', '', homeServerDomain, user),
			},
			room,
		);
	}

	public async deleteMessage(message: IMessage, user: FederatedUser): Promise<void> {
		await deleteMessage(message, user.getInternalReference());
	}

	public async reactToMessage(user: FederatedUser, message: IMessage, reaction: string, externalEventId: string): Promise<void> {
		// we need to run this as the user due to a high coupling in this function that relies on the logged in user
		await Meteor.runAsUser(user.getInternalId(), async () => {
			try {
				await executeSetReaction(reaction, message._id);
				user.getUsername() &&
					(await Messages.setFederationReactionEventId(user.getUsername() as string, message._id, reaction, externalEventId));
			} catch (error: any) {
				if (error?.message?.includes('Invalid emoji provided.')) {
					await executeSetReaction(DEFAULT_EMOJI_TO_REACT_WHEN_RECEIVED_EMOJI_DOES_NOT_EXIST, message._id);
				}
			}
		});
	}

	public async unreactToMessage(user: FederatedUser, message: IMessage, reaction: string, externalEventId: string): Promise<void> {
		// we need to run this as the user due to a high coupling in this function that relies on the logged in user
		await Meteor.runAsUser(user.getInternalId(), async () => {
			await executeSetReaction(reaction, message._id);
			await Messages.unsetFederationReactionEventId(externalEventId, message._id, reaction);
		});
	}

	public async findOneByFederationIdOnReactions(federationEventId: string, user: FederatedUser): Promise<IMessage | null | undefined> {
		return (
			(user.getUsername() && Messages.findOneByFederationIdAndUsernameOnReactions(federationEventId, user.getUsername() as string)) ||
			undefined
		);
	}

	public async getMessageByFederationId(federationEventId: string): Promise<IMessage | null> {
		return Messages.findOneByFederationId(federationEventId);
	}

	public async setExternalFederationEventOnMessage(messageId: string, federationEventId: string): Promise<void> {
		return Messages.setFederationEventIdById(messageId, federationEventId);
	}

	public async unsetExternalFederationEventOnMessageReaction(externalEventId: string, message: IMessage, reaction: string): Promise<void> {
		await Messages.unsetFederationReactionEventId(externalEventId, message._id, reaction);
	}

	public async getMessageById(internalMessageId: string): Promise<IMessage | null> {
		return Messages.findOneById(internalMessageId);
	}

	public async setExternalFederationEventOnMessageReaction(
		username: string,
		message: IMessage,
		reaction: string,
		externalEventId: string,
	): Promise<void> {
		await Messages.setFederationReactionEventId(username, message._id, reaction, externalEventId);
	}
}
