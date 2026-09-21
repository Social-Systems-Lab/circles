/**
 * The `test` object every spec imports instead of `@playwright/test`.
 *
 * It adds a database connection (one per worker), a per-test seeder that cleans up after itself, and
 * sign-in helpers. Import `expect` from here too, so a spec has a single import line.
 */

import { test as base } from "@playwright/test";
import type { Db, MongoClient } from "mongodb";
import { getRunId } from "./env";
import { connect } from "./mongo";
import { Seeder, type SeededUser } from "./seed";
import { signIn, signOut } from "./session";

type WorkerFixtures = {
    /** Test-process connection to the database the server under test is using. */
    db: Db;
};

type TestFixtures = {
    /** Creates test data and removes it when the test finishes, whether it passed or failed. */
    seed: Seeder;
    /** Signs the current browser context in as a seeded user. */
    signInAs: (user: SeededUser | { did: string }) => Promise<void>;
    /** Drops the session, leaving the context anonymous. */
    signOutCurrentUser: () => Promise<void>;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
    db: [
        async ({}, use) => {
            let client: MongoClient | undefined;
            try {
                const connection = await connect();
                client = connection.client;
                await use(connection.db);
            } finally {
                await client?.close();
            }
        },
        { scope: "worker" },
    ],

    seed: async ({ db }, use) => {
        const seeder = new Seeder(db, getRunId());
        try {
            await use(seeder);
        } finally {
            await seeder.cleanup();
        }
    },

    signInAs: async ({ context }, use) => {
        await use(async (user) => {
            await signIn(context, user.did);
        });
    },

    signOutCurrentUser: async ({ context }, use) => {
        await use(async () => {
            await signOut(context);
        });
    },
});

export { expect } from "@playwright/test";
export type { SeededCircle, SeededUser } from "./seed";
