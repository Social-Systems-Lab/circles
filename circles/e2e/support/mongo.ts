/**
 * Direct Mongo access for the test process.
 *
 * Tests seed and inspect data through the same database the server under test uses, rather than going
 * through the UI, so a test can start from exactly the state it needs. This is a separate connection
 * from the application's (src/lib/data/db.ts): importing that module would open the application's own
 * client and pull half the app into the Playwright process.
 */

import { MongoClient, type Db } from "mongodb";
import { DATABASE_NAME, MONGODB_URI, RUN_ID_FIELD } from "./env";

export const connect = async (): Promise<{ client: MongoClient; db: Db }> => {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    return { client, db: client.db(DATABASE_NAME) };
};

/** Opens a connection, runs `use`, and always closes it again. */
export const withDatabase = async <T>(use: (db: Db) => Promise<T>): Promise<T> => {
    const { client, db } = await connect();
    try {
        return await use(db);
    } finally {
        await client.close();
    }
};

/**
 * Deletes every document a run created, across all collections.
 *
 * Sweeping every collection rather than a fixed list means a new seed factory cannot silently start
 * leaving data behind.
 */
export const deleteRunDocuments = async (db: Db, runId: string): Promise<number> => {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const counts = await Promise.all(
        collections.map(async ({ name }) => {
            const { deletedCount } = await db.collection(name).deleteMany({ [RUN_ID_FIELD]: runId });
            return deletedCount ?? 0;
        }),
    );
    return counts.reduce((total, count) => total + count, 0);
};

/** Deletes leftovers from runs that crashed before their teardown could run. */
export const deleteAllRunDocuments = async (db: Db): Promise<number> => {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const counts = await Promise.all(
        collections.map(async ({ name }) => {
            const { deletedCount } = await db.collection(name).deleteMany({ [RUN_ID_FIELD]: { $exists: true } });
            return deletedCount ?? 0;
        }),
    );
    return counts.reduce((total, count) => total + count, 0);
};
