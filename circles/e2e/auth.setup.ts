/**
 * The "setup" project: creates the run's shared accounts and saves their signed-in browser state.
 *
 * Every other project depends on this one, so it runs first and its output is ready before any test
 * starts. The users are tagged with the run id like all seeded data, so the global teardown removes
 * them at the end of the run.
 */

import fs from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { getRunId } from "./support/env";
import { connect } from "./support/mongo";
import { Seeder, type SeededUser } from "./support/seed";
import { createStorageState } from "./support/session";
import { storageStatePath, writeSharedUser, type SharedRole } from "./support/shared-users";

const save = async (role: SharedRole, user: SeededUser): Promise<void> => {
    writeSharedUser(role, {
        id: user.id,
        did: user.did,
        handle: user.handle,
        name: user.name,
        email: user.email,
    });
    fs.writeFileSync(storageStatePath(role), JSON.stringify(await createStorageState(user.did), null, 4));
};

setup("create the shared accounts for this run", async ({ page }) => {
    const { client, db } = await connect();

    try {
        const seeder = new Seeder(db, getRunId());
        await save("member", await seeder.user({ name: "E2E Member" }));
        await save("admin", await seeder.adminUser({ name: "E2E Admin" }));
    } finally {
        await client.close();
    }

    // Prove the session actually authenticates before a hundred tests rely on it. A broken secret or
    // cookie name would otherwise surface as every authenticated test failing for an unrelated-looking
    // reason.
    await page.context().addCookies(JSON.parse(fs.readFileSync(storageStatePath("member"), "utf8")).cookies);
    const response = await page.goto("/circles");
    expect(response?.status(), "the app should be reachable at the configured base URL").toBeLessThan(400);
});
