import { Box, TextInput } from '@rocket.chat/fuselage';
import { useAutoFocus } from '@rocket.chat/fuselage-hooks';
import { useTranslation } from '@rocket.chat/ui-contexts';
import type { ReactElement, ChangeEvent } from 'react';
import React, { useState } from 'react';

import GenericModal from '../GenericModal';
import type { OnConfirm } from './TwoFactorModal';
import { Method } from './TwoFactorModal';

type TwoFactorTotpModalProps = {
	onConfirm: OnConfirm;
	onClose: () => void;
};

const TwoFactorTotpModal = ({ onConfirm, onClose }: TwoFactorTotpModalProps): ReactElement => {
	const t = useTranslation();
	const [code, setCode] = useState<string>('');
	const ref = useAutoFocus<HTMLInputElement>();

	const onConfirmTotpCode = (): void => {
		onConfirm(code, Method.TOTP);
	};

	const onChange = ({ currentTarget }: ChangeEvent<HTMLInputElement>): void => {
		setCode(currentTarget.value);
	};

	return (
		<GenericModal
			onConfirm={onConfirmTotpCode}
			onCancel={onClose}
			confirmText={t('Verify')}
			title={t('Two Factor Authentication')}
			onClose={onClose}
			variant='warning'
			icon='info'
			confirmDisabled={!code}
		>
			<Box mbe='x16'>{t('Open_your_authentication_app_and_enter_the_code')}</Box>
			<Box mbe='x16' display='flex' justifyContent='stretch'>
				<TextInput ref={ref} value={code} onChange={onChange} placeholder={t('Enter_authentication_code')}></TextInput>
			</Box>
		</GenericModal>
	);
};

export default TwoFactorTotpModal;
