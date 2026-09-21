/**
 * Prepares the database once, before any test runs.
 *
 * Two things happen here. First, the run gets an id that every worker inherits, so all the documents a
 * run creates can be found again and deleted — including after a crash, when the per-test cleanup never
 * got the chance. Second, the database is emptied, so a run never inherits state from the one before it.
 *
 * Emptying means deleting documents, not dropping the database: the application creates its required
 * indexes at startup (src/instrumentation-node.ts), and dropping would take them with it while the
 * server is already running.
 */

import crypto from "node:crypto";
import type { Db } from "mongodb";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { BASE_URL, MONGODB_URI, RESET_DATABASE, RUN_ID_ENV_VAR, assertSafeToReset } from "./support/env";
import { connect } from "./support/mongo";

const emptyDatabase = async (db: Db): Promise<void> => {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    await Promise.all(collections.map(({ name }) => db.collection(name).deleteMany({})));
};

/**
 * Reference data a real instance has but the application never creates on its own.
 * Without it, anything that renders causes or skills comes up empty.
 */
const seedReferenceData = async (db: Db): Promise<void> => {
    await db.collection("sdgs").insertMany(sdgs.map(({ _id, ...sdg }) => sdg));
    await db.collection("skills").insertMany(skills.map(({ _id, ...skill }) => skill));
};

/**
 * Makes the server create its own singletons — the server settings row and the default circle — before
 * the workers start.
 *
 * `getServerSettings` creates them on first use, so without this the first few parallel requests would
 * race to create them and could end up with more than one. It also pays the dev server's first-compile
 * cost once, here, instead of inside whichever test happened to run first.
 */
const bootstrapServer = async (): Promise<void> => {
    const response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    if (response.status >= 500) {
        throw new Error(`The server under test returned ${response.status} for ${BASE_URL}/`);
    }
};

const globalSetup = async (): Promise<void> => {
    const runId = crypto.randomBytes(5).toString("hex");
    process.env[RUN_ID_ENV_VAR] = runId;

    let connection;
    try {
        connection = await connect();
    } catch (error) {
        throw new Error(
            [
                `Could not reach the e2e database at ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")}`,
                ``,
                `Start it with:  bun run e2e:services`,
                `Or point the tests elsewhere with E2E_MONGODB_URI.`,
                ``,
                `${error instanceof Error ? error.message : String(error)}`,
            ].join("\n"),
        );
    }

    const { client, db } = connection;
    try {
        if (RESET_DATABASE) {
            assertSafeToReset();
            await emptyDatabase(db);
            await seedReferenceData(db);
        }
        await bootstrapServer();
        console.log(`e2e run ${runId}: database ready${RESET_DATABASE ? " (reset)" : " (reset skipped)"}`);
    } finally {
        await client.close();
    }
};

export default globalSetup;
