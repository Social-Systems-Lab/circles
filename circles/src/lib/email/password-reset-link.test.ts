import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error Bun's runtime mock API is available when this test is run with Bun.
import { mock } from "bun:test";

const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kamooni-capture-reset-"));
process.env.APP_DIR = fixtureDirectory;
process.env.IS_BUILD = "true";

const rawToken = "captured-password-reset-token";
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
const user = {
    _id: "reset-user-id",
    did: "did:kamooni:unchanged-reset-identity",
    passwordResetToken: tokenHash,
    passwordResetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
};

const circles = {
    findOne: async (query: { passwordResetToken?: string }) =>
        query.passwordResetToken === user.passwordResetToken ? user : null,
    updateOne: async (_query: unknown, update: { $set: Record<string, unknown> }) => {
        Object.assign(user, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
    },
};

mock.module("@/lib/data/db", () => ({ Circles: circles }));
mock.module("../data/db", () => ({ Circles: circles }));
mock.module("../data/user", () => ({ getUserPrivate: async () => ({ isAdmin: false }) }));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
mock.module("@/lib/auth/auth", () => ({
    ENCRYPTION_ALGORITHM: "aes-256-cbc",
    ENCRYPTED_PRIVATE_KEY_FILENAME: "private_key.enc",
    IV_FILENAME: "iv.bin",
    PRIVATE_KEY_FILENAME: "private_key.pem",
    PUBLIC_KEY_FILENAME: "public_key.pem",
    SALT_FILENAME: "salt.bin",
    USERS_DIR: path.join(fixtureDirectory, "users"),
    getAuthenticatedUserDid: async () => undefined,
}));
mock.module("../auth/auth", () => ({
    ENCRYPTION_ALGORITHM: "aes-256-cbc",
    ENCRYPTED_PRIVATE_KEY_FILENAME: "private_key.enc",
    IV_FILENAME: "iv.bin",
    PRIVATE_KEY_FILENAME: "private_key.pem",
    PUBLIC_KEY_FILENAME: "public_key.pem",
    SALT_FILENAME: "salt.bin",
    USERS_DIR: path.join(fixtureDirectory, "users"),
    getAuthenticatedUserDid: async () => undefined,
}));

try {
    const { resetPassword } = await import("@/lib/auth/actions");
    const originalDid = user.did;

    assert.deepEqual(await resetPassword(rawToken, "New-safe-password-123!"), { success: true });
    assert.equal(user.did, originalDid, "password reset must preserve the DID");
    assert.equal(user.passwordResetToken, null, "successful reset consumes the token");
    assert.equal(user.passwordResetTokenExpiry, null, "successful reset clears token expiry");

    const reused = await resetPassword(rawToken, "Another-safe-password-456!");
    assert.equal(reused.success, false, "a captured password-reset link remains one-time use");

    console.log("captured password-reset link one-time identity test passed");
} finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
}
