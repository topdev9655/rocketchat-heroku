import { upsertPermissions } from '../../../app/authorization/server/functions/upsertPermissions';
import { migrateDatabase, onFreshInstall } from '../../lib/migrations';

const { MIGRATION_VERSION = 'latest' } = process.env;

const [version, ...subcommands] = MIGRATION_VERSION.split(',');

await migrateDatabase(version === 'latest' ? version : parseInt(version), subcommands);
await onFreshInstall(upsertPermissions);
