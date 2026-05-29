import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { schema } from './schema';
import { migrations } from './migrations';
import { User, Farmer, Collection, SalesCustomer, SalesRecord, RateSetting, Ledger } from './models';

// Using LokiJS adapter for Web and Capacitor
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  useWebWorker: false, // Turn off for simplicity unless specifically optimized
  useIncrementalIndexedDB: true,
  dbName: 'dairy_app_offline_db', // Explicitly naming database for persistent storage on updates
  onQuotaExceededError: (error) => {
    console.error('Database quota exceeded', error);
  },
  onSetUpError: (error) => {
    console.error('Database setup failed', error);
  },
  extraLokiOptions: {
    autosave: true,
    autosaveInterval: 500,
  },
});

export const db = new Database({
  adapter,
  modelClasses: [
    User,
    Farmer,
    Collection,
    SalesCustomer,
    SalesRecord,
    RateSetting,
    Ledger,
  ],
});
