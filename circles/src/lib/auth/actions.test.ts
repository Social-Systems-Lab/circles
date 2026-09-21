import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ObjectId } from "mongodb";
import { silenceConsole, useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const usersDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-auth-actions-test-"));

const db = mockDb();

const getAuthenticatedUserDid = mock(async (): Promise<string | undefined> => undefined);
mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid,
    ENCRYPTION_ALGORITHM: "aes-256-cbc",
    ENCRYPTED_PRIVATE_KEY_FILENAME: "privateKey.pem.enc",
    IV_FILENAME: "iv.bin",
    PRIVATE_KEY_FILENAME: "privateKey.pem",
    PUBLIC_KEY_FILENAME: "publicKey.pem",
    SALT_FILENAME: "salt.bin",
    USERS_DIR: usersDir,
}));

const getUserPrivate = mock(async (_did: string): Promise<Record<string, unknown>> => ({}));
mock.module("@/lib/data/user", () => ({ getUserPrivate }));

const revalidatePath = mock((_path: string) => {});
mock.module("next/cache", () => ({ revalidatePath }));

const { initiatePasswordReset, resetPassword } = await import("./actions");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const consoleSpy = silenceConsole("log", "error", "warn");
const trackSpy = useSpyCleanup();

beforeEach(() => {
    db.Circles.docs = [];
    getAuthenticatedUserDid.mockReset();
    getUserPrivate.mockReset();
    revalidatePath.mockClear();
    fs.rmSync(usersDir, { recursive: true, force: true });
    fs.mkdirSync(usersDir, { recursive: true });
});

afterAll(() => fs.rmSync(usersDir, { recursive: true, force: true }));

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, did: "did:target", circleType: "user", ...overrides });
    return _id;
};

const storedUser = (id: ObjectId) => db.Circles.byId(id)!;

describe("initiatePasswordReset", () => {
    const signInAs = (isAdmin: boolean | undefined) => {
        getAuthenticatedUserDid.mockResolvedValue("did:admin");
        getUserPrivate.mockResolvedValue({ isAdmin });
    };

    const UNEXPECTED = { success: false, error: "An unexpected error occurred. Please try again." } as const;

    test("issues a reset token for an existing user", async () => {
        signInAs(true);
        const id = seedUser();

        const result = await initiatePasswordReset(id.toString());

        expect(result).toEqual({ success: true, token: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown as string });
    });

    test("stores only the sha256 hash of the token and expires it in one hour", async () => {
        signInAs(true);
        const id = seedUser();

        const { token } = (await initiatePasswordReset(id.toString())) as { success: true; token: string };

        const user = storedUser(id);
        expect(user.passwordResetToken).toBe(sha256(token));
        expect(user.passwordResetToken).not.toBe(token);
        expect(user.passwordResetTokenExpiry.getTime()).toBe(NOW.getTime() + 3600 * 1000);
    });

    test("issues a different token on every call", async () => {
        signInAs(true);
        const id = seedUser();

        const first = await initiatePasswordReset(id.toString());
        const second = await initiatePasswordReset(id.toString());

        expect(first).not.toEqual(second);
    });

    test("revalidates the admin path", async () => {
        signInAs(true);

        await initiatePasswordReset(seedUser().toString());

        expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });

    test("refuses signed-out callers without touching the database", async () => {
        const id = seedUser();
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await initiatePasswordReset(id.toString())).toEqual(UNEXPECTED);
        expect(storedUser(id).passwordResetToken).toBeUndefined();
        expect(consoleSpy.error).toHaveBeenCalledWith("Error initiating password reset:", expect.any(Error));
    });

    test("refuses callers who are not admins", async () => {
        const id = seedUser();
        for (const isAdmin of [false, undefined]) {
            signInAs(isAdmin);
            expect(await initiatePasswordReset(id.toString())).toEqual(UNEXPECTED);
        }
        expect(storedUser(id).passwordResetToken).toBeUndefined();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("reports an invalid user id when the input is not a string", async () => {
        signInAs(true);

        expect(await initiatePasswordReset(42 as unknown as string)).toEqual({
            success: false,
            error: "Invalid user ID provided.",
        });
    });

    test("reports a generic error for a string that is not an ObjectId", async () => {
        signInAs(true);

        expect(await initiatePasswordReset("not-an-object-id")).toEqual(UNEXPECTED);
    });

    test("reports a missing target user", async () => {
        signInAs(true);

        expect(await initiatePasswordReset(new ObjectId().toString())).toEqual({
            success: false,
            error: "Target user not found.",
        });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("only touches the targeted user", async () => {
        signInAs(true);
        const target = seedUser();
        const bystander = seedUser({ did: "did:other" });

        await initiatePasswordReset(target.toString());

        expect(storedUser(bystander).passwordResetToken).toBeUndefined();
    });

    test("reports failure when the token could not be stored", async () => {
        signInAs(true);
        const id = seedUser();
        trackSpy(spyOn(db.Circles, "updateOne").mockResolvedValue({ modifiedCount: 0 } as never));

        expect(await initiatePasswordReset(id.toString())).toEqual({
            success: false,
            error: "Failed to initiate reset. Please try again.",
        });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("does not leak database errors to the caller", async () => {
        signInAs(true);
        trackSpy(spyOn(db.Circles, "findOne").mockRejectedValue(new Error("connection string with secrets")));

        expect(await initiatePasswordReset(new ObjectId().toString())).toEqual(UNEXPECTED);
    });
});

describe("resetPassword", () => {
    const TOKEN = "a".repeat(64);
    const NEW_PASSWORD = "brand new password";
    const OLD_PASSWORD = "old password value";
    const DID = "did:target";

    const generateKeyPair = () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
        return {
            publicKey: publicKey.export({ type: "pkcs1", format: "pem" }) as string,
            privateKey: privateKey.export({ type: "pkcs1", format: "pem" }) as string,
        };
    };

    const accountDir = (did = DID) => path.join(usersDir, did);

    const writeEncryptedCredentials = (password: string, privateKey: string, publicKey: string, did = DID) => {
        const dir = accountDir(did);
        fs.mkdirSync(dir, { recursive: true });
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512"), iv);
        const encrypted = cipher.update(privateKey, "utf8", "hex") + cipher.final("hex");
        fs.writeFileSync(path.join(dir, "salt.bin"), salt);
        fs.writeFileSync(path.join(dir, "iv.bin"), iv);
        fs.writeFileSync(path.join(dir, "privateKey.pem.enc"), encrypted);
        fs.writeFileSync(path.join(dir, "publicKey.pem"), publicKey);
    };

    const decryptPrivateKey = (password: string, did = DID) => {
        const dir = accountDir(did);
        const salt = fs.readFileSync(path.join(dir, "salt.bin"));
        const iv = fs.readFileSync(path.join(dir, "iv.bin"));
        const encrypted = fs.readFileSync(path.join(dir, "privateKey.pem.enc"), "utf8");
        const decipher = crypto.createDecipheriv("aes-256-cbc", crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512"), iv);
        return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
    };

    const seedResettableUser = (overrides: Record<string, unknown> = {}) =>
        seedUser({
            did: DID,
            publicKey: "original-public-key",
            passwordResetToken: sha256(TOKEN),
            passwordResetTokenExpiry: new Date(NOW.getTime() + 60_000),
            ...overrides,
        });

    describe("input validation", () => {
        test("requires a token", async () => {
            expect(await resetPassword("", NEW_PASSWORD)).toEqual({
                success: false,
                error: "Invalid input: Reset token is required.",
            });
        });

        test("requires a password of at least 8 characters", async () => {
            expect(await resetPassword(TOKEN, "short")).toEqual({
                success: false,
                error: "Invalid input: Password must be at least 8 characters long",
            });
        });

        test("reports every problem at once", async () => {
            expect(await resetPassword("", "short")).toEqual({
                success: false,
                error: "Invalid input: Reset token is required., Password must be at least 8 characters long",
            });
        });

        test("does not look anything up when the input is invalid", async () => {
            const id = seedResettableUser();

            await resetPassword(TOKEN, "short");

            expect(storedUser(id).passwordResetToken).toBe(sha256(TOKEN));
        });
    });

    describe("token checks", () => {
        test("rejects an unknown token", async () => {
            seedResettableUser();

            expect(await resetPassword("b".repeat(64), NEW_PASSWORD)).toEqual({
                success: false,
                error: "Invalid or expired reset token.",
            });
        });

        test("does not accept the stored hash as if it were the token", async () => {
            seedResettableUser();

            expect(await resetPassword(sha256(TOKEN), NEW_PASSWORD)).toEqual({
                success: false,
                error: "Invalid or expired reset token.",
            });
        });

        test("rejects a matching token that has no expiry", async () => {
            seedResettableUser({ passwordResetTokenExpiry: undefined });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "Invalid or expired reset token.",
            });
        });

        test("rejects an expired token and clears it", async () => {
            const id = seedResettableUser({ passwordResetTokenExpiry: new Date(NOW.getTime() - 1) });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "Reset token has expired.",
            });
            expect(storedUser(id).passwordResetToken).toBeNull();
            expect(storedUser(id).passwordResetTokenExpiry).toBeNull();
            expect(fs.existsSync(accountDir())).toBe(false);
        });

        test("accepts a token at the exact moment of expiry", async () => {
            seedResettableUser({ passwordResetTokenExpiry: new Date(NOW.getTime()) });

            expect((await resetPassword(TOKEN, NEW_PASSWORD)).success).toBe(true);
        });

        test("rejects a token whose user has no did", async () => {
            seedResettableUser({ did: undefined });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "User identity information is missing.",
            });
        });

        test("a token cannot be used twice", async () => {
            seedResettableUser();

            expect((await resetPassword(TOKEN, NEW_PASSWORD)).success).toBe(true);
            expect(await resetPassword(TOKEN, "another password")).toEqual({
                success: false,
                error: "Invalid or expired reset token.",
            });
        });
    });

    describe("credential rotation", () => {
        test("re-encrypts the existing key material under the new password when the plaintext private key is available", async () => {
            const { publicKey, privateKey } = generateKeyPair();
            writeEncryptedCredentials(OLD_PASSWORD, privateKey, publicKey);
            fs.writeFileSync(path.join(accountDir(), "privateKey.pem"), privateKey);
            const id = seedResettableUser({ publicKey });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({ success: true });

            expect(decryptPrivateKey(NEW_PASSWORD)).toBe(privateKey);
            expect(() => decryptPrivateKey(OLD_PASSWORD)).toThrow();
            expect(storedUser(id).publicKey).toBe(publicKey);
            expect(fs.readFileSync(path.join(accountDir(), "publicKey.pem"), "utf8")).toBe(publicKey);
        });

        test("uses a fresh salt and iv for the new encryption", async () => {
            const { publicKey, privateKey } = generateKeyPair();
            writeEncryptedCredentials(OLD_PASSWORD, privateKey, publicKey);
            fs.writeFileSync(path.join(accountDir(), "privateKey.pem"), privateKey);
            seedResettableUser({ publicKey });
            const before = {
                salt: fs.readFileSync(path.join(accountDir(), "salt.bin")),
                iv: fs.readFileSync(path.join(accountDir(), "iv.bin")),
            };

            await resetPassword(TOKEN, NEW_PASSWORD);

            expect(fs.readFileSync(path.join(accountDir(), "salt.bin")).equals(before.salt)).toBe(false);
            expect(fs.readFileSync(path.join(accountDir(), "iv.bin")).equals(before.iv)).toBe(false);
        });

        // Accounts do not keep a plaintext private key on disk, so a reset cannot recover the old
        // key and generates a new pair. The DID is unchanged; only the stored public key rotates.
        test("generates a fresh key pair when the private key cannot be recovered", async () => {
            const original = generateKeyPair();
            writeEncryptedCredentials(OLD_PASSWORD, original.privateKey, original.publicKey);
            const id = seedResettableUser({ publicKey: original.publicKey });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({ success: true });

            const newPrivate = decryptPrivateKey(NEW_PASSWORD);
            const newPublic = crypto.createPublicKey(newPrivate).export({ type: "pkcs1", format: "pem" });
            expect(newPrivate).not.toBe(original.privateKey);
            expect(newPublic).not.toBe(original.publicKey);
            expect(storedUser(id).publicKey).toBe(newPublic as string);
            expect(fs.readFileSync(path.join(accountDir(), "publicKey.pem"), "utf8")).toBe(newPublic as string);
            expect(storedUser(id).did).toBe(DID);
            expect(consoleSpy.warn).toHaveBeenCalledWith(
                `Password reset regenerated filesystem key material for DID ${DID} after credential loss.`,
            );
        });

        test("rebuilds credentials from scratch when the account directory is missing", async () => {
            const id = seedResettableUser({ publicKey: undefined });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({ success: true });

            expect(fs.readdirSync(accountDir()).sort()).toEqual(["iv.bin", "privateKey.pem.enc", "publicKey.pem", "salt.bin"]);
            expect(decryptPrivateKey(NEW_PASSWORD)).toContain("BEGIN RSA PRIVATE KEY");
            expect(storedUser(id).publicKey).toContain("BEGIN RSA PUBLIC KEY");
        });

        test("falls back to the public key on disk when the user record has none", async () => {
            const { publicKey, privateKey } = generateKeyPair();
            writeEncryptedCredentials(OLD_PASSWORD, privateKey, publicKey);
            fs.writeFileSync(path.join(accountDir(), "privateKey.pem"), privateKey);
            const id = seedResettableUser({ publicKey: undefined });

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({ success: true });

            expect(storedUser(id).publicKey).toBe(publicKey);
        });

        test("clears the reset token and expiry once the password has been reset", async () => {
            const id = seedResettableUser();

            await resetPassword(TOKEN, NEW_PASSWORD);

            expect(storedUser(id).passwordResetToken).toBeNull();
            expect(storedUser(id).passwordResetTokenExpiry).toBeNull();
        });

        test("never changes the user's did", async () => {
            const id = seedResettableUser();

            await resetPassword(TOKEN, NEW_PASSWORD);

            expect(storedUser(id).did).toBe(DID);
        });

        test("only updates the user that owns the token", async () => {
            seedResettableUser();
            const bystander = seedUser({ did: "did:other", publicKey: "keep", passwordResetToken: "other-hash" });

            await resetPassword(TOKEN, NEW_PASSWORD);

            expect(storedUser(bystander)).toMatchObject({ publicKey: "keep", passwordResetToken: "other-hash" });
        });
    });

    describe("failures", () => {
        test("reports a credential update failure and keeps the token usable", async () => {
            const id = seedResettableUser();
            fs.writeFileSync(accountDir(), "a file where the account directory should be");

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "Failed to update user credentials.",
            });
            expect(storedUser(id).passwordResetToken).toBe(sha256(TOKEN));
            expect(consoleSpy.error).toHaveBeenCalledWith("Filesystem error during password reset:", expect.any(Error));
        });

        test("reports a failed user record update", async () => {
            seedResettableUser();
            trackSpy(spyOn(db.Circles, "updateOne").mockResolvedValue({ matchedCount: 0 } as never));

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "Failed to update user record. Please contact support.",
            });
        });

        test("does not leak unexpected errors", async () => {
            trackSpy(spyOn(db.Circles, "findOne").mockRejectedValue(new Error("secret connection details")));

            expect(await resetPassword(TOKEN, NEW_PASSWORD)).toEqual({
                success: false,
                error: "An unexpected error occurred during password reset.",
            });
            expect(consoleSpy.error).toHaveBeenCalledWith("Error resetting password:", expect.any(Error));
        });
    });
});
