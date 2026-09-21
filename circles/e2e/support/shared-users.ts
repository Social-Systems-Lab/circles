/**
 * The accounts that exist for a whole run, and where their signed-in browser state is stored.
 *
 * Most tests only need "some signed-in user", and creating one per test would mean paying for a user
 * and a sign-in on every single test. These two are created once by auth.setup.ts and reused through
 * `storageState`, so a test that needs a signed-in member starts already signed in.
 *
 * Tests that change a user (its profile, its memberships, its settings) must create their own with the
 * `seed` fixture instead, so they cannot disturb each other.
 */

import fs from "node:fs";
import path from "node:path";

export type SharedRole = "member" | "admin";

export type SharedUser = {
    id: string;
    did: string;
    handle: string;
    name: string;
    email: string;
};

// Playwright transpiles specs to CommonJS, so `__dirname` is the portable choice here.
const AUTH_DIR = path.join(__dirname, "..", ".auth");

export const storageStatePath = (role: SharedRole): string => path.join(AUTH_DIR, `${role}.storage.json`);

const userPath = (role: SharedRole): string => path.join(AUTH_DIR, `${role}.user.json`);

export const writeSharedUser = (role: SharedRole, user: SharedUser): void => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(userPath(role), JSON.stringify(user, null, 4));
};

export const readSharedUser = (role: SharedRole): SharedUser => {
    try {
        return JSON.parse(fs.readFileSync(userPath(role), "utf8")) as SharedUser;
    } catch {
        throw new Error(
            `No shared "${role}" user for this run. It is created by the "setup" project; run tests through playwright.config.ts.`,
        );
    }
};
