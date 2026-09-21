/**
 * Removes whatever this run left behind.
 *
 * Tests clean up their own data through the `seed` fixture, so in a healthy run this finds nothing. It
 * matters when a test crashes, times out, or is interrupted: the documents are still tagged with the
 * run id, so they can be found and deleted here. That keeps runs against a long-lived database — a
 * shared staging Mongo, say — from accumulating junk.
 */

import { RUN_ID_ENV_VAR } from "./support/env";
import { deleteRunDocuments, withDatabase } from "./support/mongo";

const globalTeardown = async (): Promise<void> => {
    const runId = process.env[RUN_ID_ENV_VAR];
    if (!runId) return;

    try {
        const deleted = await withDatabase((db) => deleteRunDocuments(db, runId));
        if (deleted > 0) {
            console.log(`e2e run ${runId}: swept ${deleted} leftover document(s)`);
        }
    } catch (error) {
        // A teardown failure must not turn a green run red; report it and move on.
        console.warn(`e2e run ${runId}: cleanup failed`, error);
    }
};

export default globalTeardown;
