import { Box, Message } from '@rocket.chat/fuselage';
import React, { memo } from 'react';

import UserAvatar from '../../../../../components/avatar/UserAvatar';

const DiscussionMessage = ({
	_id,
	msg,
	following,
	username,
	name = username,
	ts,
	dcount,
	t = (text) => text,
	participants,
	handleFollowButton,
	unread,
	mention,
	all,
	formatDate = (e) => e,
	dlm,
	className = [],
	...props
}) => (
	<Box is={Message} {...props} className={className} pbs='x16' pbe='x8'>
		<Message.LeftContainer>
			<UserAvatar username={username} className='rcx-message__avatar' size='x36' />
		</Message.LeftContainer>
		<Message.Container>
			<Message.Header>
				<Message.Name title={username}>{name}</Message.Name>
				<Message.Timestamp>{formatDate(ts)}</Message.Timestamp>
			</Message.Header>
			<Message.Body clamp={2}>{msg}</Message.Body>
			<Message.Block>
				<Message.Metrics>
					{!dcount && (
						<Message.Metrics.Item>
							<Message.Metrics.Item.Label>{t('No_messages_yet')}</Message.Metrics.Item.Label>
						</Message.Metrics.Item>
					)}
					{!!dcount && (
						<Message.Metrics.Item>
							<Message.Metrics.Item.Icon name='discussion' />
							<Message.Metrics.Item.Label>{dcount}</Message.Metrics.Item.Label>
						</Message.Metrics.Item>
					)}
					{!!dcount && (
						<Message.Metrics.Item>
							<Message.Metrics.Item.Icon name='clock' />
							<Message.Metrics.Item.Label>{formatDate(dlm)}</Message.Metrics.Item.Label>
						</Message.Metrics.Item>
					)}
				</Message.Metrics>
			</Message.Block>
		</Message.Container>
	</Box>
);

export default memo(DiscussionMessage);
