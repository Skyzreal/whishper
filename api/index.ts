import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { openDb } from '../server/db';

const config = loadConfig();
const dbPromise = openDb(config.databaseUrl, config.databaseAuthToken);

export default createApp({ config, getDb: () => dbPromise });
