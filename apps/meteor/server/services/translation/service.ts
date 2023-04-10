import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import { Settings } from '@rocket.chat/models';
import type { IUser } from '@rocket.chat/core-typings';
import mem from 'mem';
import { ServiceClassInternal } from '@rocket.chat/core-services';
import type { ITranslationService } from '@rocket.chat/core-services';

export class TranslationService extends ServiceClassInternal implements ITranslationService {
	protected name = 'translation';

	// Cache the server language for 1 hour
	private getServerLanguageCached = mem(this.getServerLanguage.bind(this), { maxAge: 1000 * 60 * 60 });

	private async getServerLanguage(): Promise<string> {
		return ((await Settings.findOneById('Language'))?.value as string) || 'en';
	}

	// Use translateText when you already know the language, or want to translate to a predefined language
	translateText(text: string, targetLanguage: string): Promise<string> {
		return Promise.resolve(TAPi18n.__(text, { lng: targetLanguage }));
	}

	// Use translate when you want to translate to the user's language, or server's as a fallback
	async translate(text: string, user: IUser): Promise<string> {
		const language = user.language || (await this.getServerLanguageCached());

		return this.translateText(text, language);
	}

	async translateToServerLanguage(text: string): Promise<string> {
		const language = await this.getServerLanguageCached();

		return this.translateText(text, language);
	}
}
