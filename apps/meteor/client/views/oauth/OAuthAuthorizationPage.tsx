import { useQueryStringParameter, useUser } from '@rocket.chat/ui-contexts';
import RegistrationPageRouter from '@rocket.chat/web-ui-registration';
import React from 'react';

import { getErrorMessage } from '../../lib/errorHandling';
import PageLoading from '../root/PageLoading';
import AuthorizationFormPage from './components/AuthorizationFormPage';
import ErrorPage from './components/ErrorPage';
import { useOAuthAppQuery } from './hooks/useOAuthAppQuery';

const OAuthAuthorizationPage = () => {
	const user = useUser();
	const clientId = useQueryStringParameter('client_id');
	const redirectUri = useQueryStringParameter('redirect_uri');

	const oauthAppQuery = useOAuthAppQuery(clientId, {
		enabled: !!user,
	});

	if (!user) {
		return <RegistrationPageRouter />;
	}

	if (oauthAppQuery.isLoading) {
		return <PageLoading />;
	}

	if (oauthAppQuery.isError) {
		return <ErrorPage error={getErrorMessage(oauthAppQuery.error)} />;
	}

	return <AuthorizationFormPage oauthApp={oauthAppQuery.data} redirectUri={redirectUri ?? ''} user={user} />;
};

export default OAuthAuthorizationPage;
