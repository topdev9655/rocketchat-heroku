import type { IImportUser, IUser } from '@rocket.chat/core-typings';
import { Users } from '@rocket.chat/models';

import { VirtualDataConverter } from '../../../app/importer/server/classes/VirtualDataConverter';
import type { IConverterOptions } from '../../../app/importer/server/classes/ImportDataConverter';
import { Logger } from '../logger/Logger';
import { settings } from '../../../app/settings/server';

const logger = new Logger('LDAP Data Converter');

export class LDAPDataConverter extends VirtualDataConverter {
	private mergeExistingUsers: boolean;

	constructor(virtual = true, options?: IConverterOptions) {
		super(virtual, options);
		this.setLogger(logger);

		this.mergeExistingUsers = settings.get<boolean>('LDAP_Merge_Existing_Users') ?? true;
	}

	async findExistingUser(data: IImportUser): Promise<IUser | undefined> {
		if (data.services?.ldap?.id) {
			const importedUser = await Users.findOneByLDAPId(data.services.ldap.id, data.services.ldap.idAttribute);
			if (importedUser) {
				return importedUser;
			}
		}

		if (!this.mergeExistingUsers) {
			return;
		}

		// Search by email and username
		return super.findExistingUser(data);
	}

	static async convertSingleUser(userData: IImportUser, options?: IConverterOptions): Promise<void> {
		const converter = new LDAPDataConverter(true, options);
		await converter.addUser(userData);
		await converter.convertUsers();
	}
}
