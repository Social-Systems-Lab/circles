import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import { setEnv, snapshotEnv } from "@/test/env";
import { featureFixture, participatingUser } from "@/test/fixtures";
import { silenceConsole } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const restoreEnv = snapshotEnv(
    "APP_DIR",
    "CIRCLES_URL",
    "CIRCLES_HOST",
    "CIRCLES_LOCAL_AUTH_DIR",
    "CIRCLES_JWT_SECRET",
    "JWT_SECRET",
    "NODE_ENV",
);

const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-auth-test-"));
setEnv("APP_DIR", appDir);
setEnv("CIRCLES_JWT_SECRET", "auth-test-secret-with-plenty-of-entropy");

// --- module mocks -----------------------------------------------------------------------------

const db = mockDb();

const cookieJar = new Map<string, string>();
const cookieSet = mock((name: string, value: string, _options?: unknown) => void cookieJar.set(name, value));
mock.module("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
        set: cookieSet,
    }),
}));

const createNewUser = mock((did: string, publicKey: string, name: string, handle: string, type: string, email: string, isEmailVerified: boolean, emailVerificationToken: string, emailVerificationTokenExpiry: Date) => ({
    did,
    publicKey,
    name,
    handle,
    type,
    email,
    isEmailVerified,
    emailVerificationToken,
    emailVerificationTokenExpiry,
    circleType: "user",
}));
mock.module("@/lib/data/user", () => ({ createNewUser, getUserById: mock(), getUserPrivate: mock() }));

const addMember = mock(async (..._args: unknown[]) => {});
const getMembers = mock(async (_circleId: string): Promise<unknown[]> => []);
mock.module("@/lib/data/member", () => ({ addMember, getMembers }));

const getCircleById = mock(async (_id: string): Promise<unknown> => undefined);
const getCirclesByDids = mock(async (_dids: string[]): Promise<unknown[]> => []);
mock.module("@/lib/data/circle", () => ({
    getCircleById,
    getCirclesByDids,
    getCirclesByIds: mock(),
    getDefaultCircle: mock(),
}));

const sendEmail = mock(async (_message: unknown) => {});
mock.module("@/lib/data/email", () => ({
    generateSecureToken: () => "plain-verification-token",
    hashToken: (token: string) => `hashed:${token}`,
    sendEmail,
}));

const getNextSignupOrder = mock(async () => 42);
mock.module("@/lib/data/platform-settings", () => ({ getNextSignupOrder }));

const auth = await import("./auth");

// --- helpers ----------------------------------------------------------------------------------

const PASSWORD = "correct horse battery staple";

const consoleSpy = silenceConsole("log", "error");

const resetState = () => {
    db.Circles.docs = [];
    db.Members.docs = [];
    cookieJar.clear();
    cookieSet.mockClear();
    createNewUser.mockClear();
    addMember.mockReset();
    addMember.mockResolvedValue(undefined);
    getMembers.mockReset();
    getMembers.mockResolvedValue([]);
    getCircleById.mockReset();
    getCirclesByDids.mockReset();
    getCirclesByDids.mockResolvedValue([]);
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(undefined);
    getNextSignupOrder.mockReset();
    getNextSignupOrder.mockResolvedValue(42);
};

beforeEach(() => {
    resetState();
});

afterAll(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
    restoreEnv();
});

const seedCircle = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, circleType: "circle", createdBy: "did:owner", ...overrides });
    return _id;
};

const seedMember = (userDid: string, circleId: ObjectId | string, userGroups: string[] | undefined) => {
    db.Members.docs.push({ userDid, circleId: circleId.toString(), userGroups });
};

// --- constants --------------------------------------------------------------------------------

describe("exported constants", () => {
    test("names the credential files and cipher", () => {
        expect(auth.SALT_FILENAME).toBe("salt.bin");
        expect(auth.IV_FILENAME).toBe("iv.bin");
        expect(auth.PUBLIC_KEY_FILENAME).toBe("publicKey.pem");
        expect(auth.PRIVATE_KEY_FILENAME).toBe("privateKey.pem");
        expect(auth.ENCRYPTED_PRIVATE_KEY_FILENAME).toBe("privateKey.pem.enc");
        expect(auth.ENCRYPTION_ALGORITHM).toBe("aes-256-cbc");
    });

    test("stores users and the server key under the configured APP_DIR", () => {
        expect(auth.APP_DIR).toBe(appDir);
        expect(auth.USERS_DIR).toBe(path.join(appDir, "users"));
        expect(auth.SERVER_DIR).toBe(path.join(appDir, "server"));
    });
});

describe("APP_DIR resolution", () => {
    let instance = 0;
    const loadWith = async (env: Record<string, string | undefined>) => {
        for (const name of ["APP_DIR", "CIRCLES_URL", "CIRCLES_HOST", "CIRCLES_LOCAL_AUTH_DIR", "NODE_ENV"]) {
            setEnv(name, env[name]);
        }
        instance += 1;
        return (await import(`./auth?instance=${instance}`)) as typeof import("./auth");
    };
    const localDir = path.join(process.cwd(), "circles_data");

    afterEach(() => {
        setEnv("APP_DIR", appDir);
    });

    test("prefers an explicit APP_DIR", async () => {
        expect((await loadWith({ APP_DIR: "/custom", NODE_ENV: "production" })).APP_DIR).toBe("/custom");
    });

    test("uses /circles in production", async () => {
        expect((await loadWith({ NODE_ENV: "production" })).APP_DIR).toBe("/circles");
    });

    test("uses ./circles_data outside production", async () => {
        expect((await loadWith({ NODE_ENV: "development" })).APP_DIR).toBe(localDir);
        expect((await loadWith({ NODE_ENV: "test" })).APP_DIR).toBe(localDir);
    });

    test("uses ./circles_data for local-like runtimes even in production", async () => {
        const local = { NODE_ENV: "production" };
        expect((await loadWith({ ...local, CIRCLES_LOCAL_AUTH_DIR: "true" })).APP_DIR).toBe(localDir);
        expect((await loadWith({ ...local, CIRCLES_HOST: "db" })).APP_DIR).toBe(localDir);
        expect((await loadWith({ ...local, CIRCLES_URL: "http://db:3000" })).APP_DIR).toBe(localDir);
        expect((await loadWith({ ...local, CIRCLES_URL: "http://localhost:3000" })).APP_DIR).toBe(localDir);
        expect((await loadWith({ ...local, CIRCLES_URL: "http://127.0.0.1:3000" })).APP_DIR).toBe(localDir);
    });

    test("does not treat other hosts or flag values as local", async () => {
        const prod = { NODE_ENV: "production" };
        expect((await loadWith({ ...prod, CIRCLES_LOCAL_AUTH_DIR: "false" })).APP_DIR).toBe("/circles");
        expect((await loadWith({ ...prod, CIRCLES_HOST: "example.com" })).APP_DIR).toBe("/circles");
        expect((await loadWith({ ...prod, CIRCLES_URL: "https://kamooni.org" })).APP_DIR).toBe("/circles");
    });

    test("derives the users and server directories from it", async () => {
        const loaded = await loadWith({ APP_DIR: "/somewhere" });
        expect(loaded.USERS_DIR).toBe("/somewhere/users");
        expect(loaded.SERVER_DIR).toBe("/somewhere/server");
    });
});

// --- accounts and credentials -----------------------------------------------------------------

describe("createUserAccount", () => {
    let account: Awaited<ReturnType<typeof auth.createUserAccount>>;

    // Key generation and key derivation are deliberately slow, so the shared account is made once.
    beforeAll(async () => {
        setSystemTime();
        const spy = spyOn(console, "log").mockImplementation(() => {});
        account = await auth.createUserAccount("Alice", "alice", "user", "alice@example.com", PASSWORD);
        spy.mockRestore();
    });

    test("returns the created user with its database id", () => {
        expect(account.name).toBe("Alice");
        expect(account.handle).toBe("alice");
        expect(account.email).toBe("alice@example.com");
        expect(account._id).toBeString();
    });

    test("derives the did from the sha256 of the public key", () => {
        const publicKey = fs.readFileSync(path.join(auth.USERS_DIR, account.did!, auth.PUBLIC_KEY_FILENAME), "utf8");
        expect(account.did).toBe(crypto.createHash("sha256").update(publicKey).digest("hex"));
        expect(account.publicKey).toBe(publicKey);
    });

    test("stores the salt, iv, public key and encrypted private key in a directory named after the did", () => {
        const dir = path.join(auth.USERS_DIR, account.did!);

        expect(fs.readdirSync(dir).sort()).toEqual(
            [auth.ENCRYPTED_PRIVATE_KEY_FILENAME, auth.IV_FILENAME, auth.PUBLIC_KEY_FILENAME, auth.SALT_FILENAME].sort(),
        );
        expect(fs.readFileSync(path.join(dir, auth.SALT_FILENAME))).toHaveLength(16);
        expect(fs.readFileSync(path.join(dir, auth.IV_FILENAME))).toHaveLength(16);
        expect(fs.readFileSync(path.join(dir, auth.PUBLIC_KEY_FILENAME), "utf8")).toContain("BEGIN RSA PUBLIC KEY");
    });

    test("never writes the private key to disk in plain text", () => {
        const dir = path.join(auth.USERS_DIR, account.did!);
        for (const file of fs.readdirSync(dir)) {
            expect(fs.readFileSync(path.join(dir, file)).toString("latin1")).not.toContain("PRIVATE KEY");
        }
        expect(fs.readFileSync(path.join(dir, auth.ENCRYPTED_PRIVATE_KEY_FILENAME), "utf8")).toMatch(/^[0-9a-f]+$/);
    });

    test("can decrypt the private key with the password and sign challenges the public key verifies", () => {
        const signature = auth.signRegisterUserChallenge(account.did!, PASSWORD, "challenge-text");
        const verify = crypto.createVerify("SHA256").update("challenge-text");

        expect(verify.verify(auth.getUserPublicKey(account.did!), signature, "base64")).toBe(true);
    });

    describe("database state and side effects", () => {
        const created = async (email = "bob@example.com", handle = "bob") => {
            const user = await auth.createUserAccount("Bob", handle, "user", email, PASSWORD);
            const stored = db.Circles.docs.find((doc) => doc.handle === handle);
            return { user, stored };
        };

        test("inserts the user as unverified with a pending account status", async () => {
            const { user, stored } = await created();

            expect(stored).toMatchObject({
                did: user.did,
                verificationStatus: "unverified",
                accountStatus: "pending_verification",
                isEmailVerified: false,
            });
            expect(user._id).toBe(stored!._id.toString());
        });

        test("stores only the hash of the verification token, expiring in 24 hours", async () => {
            const now = new Date("2026-06-15T12:00:00.000Z");
            setSystemTime(now);
            try {
                const { stored } = await created();

                expect(stored!.emailVerificationToken).toBe("hashed:plain-verification-token");
                expect(stored!.emailVerificationTokenExpiry.getTime()).toBe(now.getTime() + 24 * 3600 * 1000);
                expect(JSON.stringify(stored)).not.toContain('"plain-verification-token"');
            } finally {
                setSystemTime();
            }
        });

        test("passes the profile details to the user factory", async () => {
            const { user } = await created();

            expect(createNewUser).toHaveBeenCalledTimes(1);
            const args = createNewUser.mock.calls[0];
            expect(args[0]).toBe(user.did!);
            expect((args as unknown[]).slice(2, 7)).toEqual(["Bob", "bob", "user", "bob@example.com", false]);
        });

        test("records the next signup order", async () => {
            const { user, stored } = await created();

            expect(stored!.signupOrder).toBe(42);
            expect(user.signupOrder).toBe(42);
        });

        test("still creates the account when the signup order cannot be assigned", async () => {
            getNextSignupOrder.mockRejectedValue(new Error("settings unavailable"));

            const { user, stored } = await created();

            expect(user.signupOrder).toBeUndefined();
            expect(stored!.signupOrder).toBeUndefined();
            expect(consoleSpy.error).toHaveBeenCalledWith("Failed to set signupOrder:", expect.any(Error));
        });

        test("emails a verification link containing the plain token", async () => {
            setEnv("CIRCLES_URL", "https://kamooni.example");
            const { stored } = await created();

            expect(sendEmail).toHaveBeenCalledWith({
                to: "bob@example.com",
                templateAlias: "email-verification",
                templateModel: {
                    name: "Bob",
                    actionUrl: "https://kamooni.example/verify-email?token=plain-verification-token",
                },
            });
            expect(stored!.emailVerificationLastSentAt).toBeInstanceOf(Date);
        });

        test("falls back to a localhost link when CIRCLES_URL is not set", async () => {
            setEnv("CIRCLES_URL", undefined);
            await created();

            expect(sendEmail.mock.calls[0][0]).toMatchObject({
                templateModel: { actionUrl: "http://localhost:3000/verify-email?token=plain-verification-token" },
            });
        });

        test("still creates the account when the verification email fails to send", async () => {
            sendEmail.mockRejectedValue(new Error("smtp down"));

            const { user, stored } = await created();

            expect(user._id).toBeString();
            expect(stored).toBeDefined();
            expect(stored!.emailVerificationLastSentAt).toBeUndefined();
            expect(consoleSpy.error).toHaveBeenCalledWith(
                "Failed to send verification email to bob@example.com:",
                expect.any(Error),
            );
        });

        test("exposes the verification token and url outside production for local development", async () => {
            setEnv("NODE_ENV", "development");
            const { user } = await created();

            expect(user.devVerificationToken).toBe("plain-verification-token");
            expect(user.devVerificationUrl).toContain("/verify-email?token=plain-verification-token");
        });

        test("never exposes the verification token in production", async () => {
            setEnv("NODE_ENV", "production");
            const { user } = await created();

            expect(user.devVerificationToken).toBeUndefined();
            expect(user.devVerificationUrl).toBeUndefined();
            expect(consoleSpy.log.mock.calls.flat().join("\n")).not.toContain("plain-verification-token");
        });

        test("makes the user an admin, moderator and member of their own circle", async () => {
            const { user } = await created();

            expect(addMember).toHaveBeenCalledWith(user.did, user._id, ["admins", "moderators", "members"], undefined);
        });

        test("does not touch the database when required fields are missing", async () => {
            const incomplete: Parameters<typeof auth.createUserAccount>[] = [
                ["", "h", "user", "a@b.c", "pw"],
                ["n", "", "user", "a@b.c", "pw"],
                ["n", "h", "user", "", "pw"],
                ["n", "h", "user", "a@b.c", ""],
            ];
            for (const args of incomplete) {
                await expect(auth.createUserAccount(...args)).rejects.toThrow("Missing required fields");
            }
            expect(db.Circles.docs).toHaveLength(0);
            expect(sendEmail).not.toHaveBeenCalled();
        });

        test("rejects an email that is already in use", async () => {
            db.Circles.docs.push({ _id: new ObjectId(), email: "taken@example.com", handle: "someone" });

            await expect(auth.createUserAccount("N", "fresh", "user", "taken@example.com", "pw")).rejects.toThrow(
                "Email already in use",
            );
            expect(db.Circles.docs).toHaveLength(1);
        });

        test("rejects a handle that is already in use", async () => {
            db.Circles.docs.push({ _id: new ObjectId(), email: "other@example.com", handle: "taken" });

            await expect(auth.createUserAccount("N", "taken", "user", "fresh@example.com", "pw")).rejects.toThrow(
                "Handle already in use",
            );
            expect(db.Circles.docs).toHaveLength(1);
        });

        test("checks the email before the handle", async () => {
            db.Circles.docs.push({ _id: new ObjectId(), email: "taken@example.com", handle: "taken" });

            await expect(auth.createUserAccount("N", "taken", "user", "taken@example.com", "pw")).rejects.toThrow(
                "Email already in use",
            );
        });

        test("does not write credentials for a rejected signup", async () => {
            const before = fs.readdirSync(auth.USERS_DIR).length;
            db.Circles.docs.push({ _id: new ObjectId(), email: "taken@example.com" });

            await expect(auth.createUserAccount("N", "fresh", "user", "taken@example.com", "pw")).rejects.toThrow();

            expect(fs.readdirSync(auth.USERS_DIR)).toHaveLength(before);
        });
    });
});

describe("getUserPrivateKey", () => {
    let did: string;

    beforeAll(async () => {
        const spy = spyOn(console, "log").mockImplementation(() => {});
        did = (await auth.createUserAccount("Carol", "carol", "user", "carol@example.com", PASSWORD)).did!;
        spy.mockRestore();
    });

    test("decrypts the private key with the right password", () => {
        const privateKey = auth.getUserPrivateKey(did, PASSWORD);

        expect(privateKey).toContain("BEGIN RSA PRIVATE KEY");
        expect(crypto.createPrivateKey(privateKey).asymmetricKeyType).toBe("rsa");
    });

    test("decrypts a key that matches the stored public key", () => {
        const publicFromPrivate = crypto
            .createPublicKey(auth.getUserPrivateKey(did, PASSWORD))
            .export({ type: "pkcs1", format: "pem" });

        expect(publicFromPrivate).toBe(auth.getUserPublicKey(did));
    });

    test("rejects a wrong password with an AuthenticationError", () => {
        expect(() => auth.getUserPrivateKey(did, "wrong password")).toThrow(auth.AuthenticationError);
        expect(() => auth.getUserPrivateKey(did, "wrong password")).toThrow("Incorrect password");
    });

    test("rejects an empty password", () => {
        expect(() => auth.getUserPrivateKey(did, "")).toThrow("Incorrect password");
    });

    test("logs a diagnostic for a wrong password outside production only", () => {
        setEnv("NODE_ENV", "development");
        expect(() => auth.getUserPrivateKey(did, "nope")).toThrow();
        expect(consoleSpy.log.mock.calls.flat().join("\n")).toContain("verificationBranch=password_mismatch");

        consoleSpy.log.mockClear();
        setEnv("NODE_ENV", "production");
        expect(() => auth.getUserPrivateKey(did, "nope")).toThrow();
        expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test("tells the user to reset their password when the credential directory is missing", () => {
        expect(() => auth.getUserPrivateKey("does-not-exist", PASSWORD)).toThrow(auth.AuthenticationError);
        expect(() => auth.getUserPrivateKey("does-not-exist", PASSWORD)).toThrow(/Forgot Password/);
        expect(consoleSpy.error).toHaveBeenCalledWith(
            "Login failed: auth credential directory missing",
            expect.objectContaining({ did: "does-not-exist" }),
        );
    });

    test("AuthenticationError is a named Error", () => {
        const error = new auth.AuthenticationError("nope");

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("AuthenticationError");
        expect(error.message).toBe("nope");
    });
});

describe("authenticateUser", () => {
    let did: string;

    beforeAll(async () => {
        const spy = spyOn(console, "log").mockImplementation(() => {});
        did = (await auth.createUserAccount("Dan", "dan", "user", "dan@example.com", PASSWORD)).did!;
        spy.mockRestore();
    });

    test("returns true for the right password", () => {
        expect(auth.authenticateUser(did, PASSWORD)).toBe(true);
    });

    test("throws for a wrong password instead of returning false", () => {
        expect(() => auth.authenticateUser(did, "wrong")).toThrow("Incorrect password");
    });

    test("throws for an unknown account", () => {
        expect(() => auth.authenticateUser("unknown-did", PASSWORD)).toThrow(auth.AuthenticationError);
    });
});

describe("getUserPublicKey", () => {
    test("throws when the user has no stored public key", () => {
        expect(() => auth.getUserPublicKey("does-not-exist")).toThrow("User public key not found");
    });
});

describe("server identity", () => {
    // The server key lives in the shared SERVER_DIR, so these tests run in a fixed order.
    const removeServerDir = () => fs.rmSync(auth.SERVER_DIR, { recursive: true, force: true });

    beforeEach(removeServerDir);
    afterAll(removeServerDir);

    test("getServerPublicKey throws before a server key exists", () => {
        expect(() => auth.getServerPublicKey()).toThrow("Server public key not found");
    });

    test("createServerDid generates a key pair and a did derived from the public key", async () => {
        const server = await auth.createServerDid();

        expect(server.publicKey).toContain("BEGIN RSA PUBLIC KEY");
        expect(server.did).toBe(crypto.createHash("sha256").update(server.publicKey).digest("hex"));
        expect(fs.existsSync(path.join(auth.SERVER_DIR, auth.PRIVATE_KEY_FILENAME))).toBe(true);
        expect(auth.getServerPublicKey()).toBe(server.publicKey);
    });

    test("createServerDid is idempotent and reuses the existing key", async () => {
        const first = await auth.createServerDid();
        const second = await auth.createServerDid();

        expect(second).toEqual(first);
    });

    test("createServerDid refuses to overwrite a private key whose public key is missing", async () => {
        fs.mkdirSync(auth.SERVER_DIR, { recursive: true });
        fs.writeFileSync(path.join(auth.SERVER_DIR, auth.PRIVATE_KEY_FILENAME), "orphaned");

        await expect(auth.createServerDid()).rejects.toThrow("Server private key exists but public key is missing");
        expect(fs.readFileSync(path.join(auth.SERVER_DIR, auth.PRIVATE_KEY_FILENAME), "utf8")).toBe("orphaned");
    });

    test("signRegisterServerChallenge produces a signature the server public key verifies", async () => {
        const server = await auth.createServerDid();

        const signature = auth.signRegisterServerChallenge("register-me");

        expect(crypto.createVerify("SHA256").update("register-me").verify(server.publicKey, signature, "base64")).toBe(true);
        expect(crypto.createVerify("SHA256").update("something else").verify(server.publicKey, signature, "base64")).toBe(false);
    });

    test("signRegisterServerChallenge fails when there is no server key", () => {
        expect(() => auth.signRegisterServerChallenge("register-me")).toThrow();
    });
});

// --- access levels ----------------------------------------------------------------------------

describe("getMemberAccessLevel", () => {
    const groups = [
        { handle: "admins", accessLevel: 1 },
        { handle: "moderators", accessLevel: 2 },
        { handle: "members", accessLevel: 3 },
    ];

    const setup = (userGroups: string[] | undefined, circleGroups: unknown = groups) => {
        const circleId = seedCircle({ userGroups: circleGroups });
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:user", circleType: "user" });
        seedMember("did:user", circleId, userGroups);
        return circleId.toString();
    };

    test("returns the lowest access level of the member's groups (lowest number is most powerful)", async () => {
        const circleId = setup(["members", "moderators"]);
        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(2);
    });

    test("returns the level of a single group", async () => {
        const circleId = setup(["admins"]);
        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(1);
    });

    test("returns the maximum level for an unknown user", async () => {
        const circleId = setup(["admins"]);
        expect(await auth.getMemberAccessLevel("did:nobody", circleId)).toBe(9999999);
    });

    test("returns the maximum level for a user who is not a member", async () => {
        const circleId = seedCircle({ userGroups: groups }).toString();
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:user", circleType: "user" });

        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(9999999);
    });

    test("returns the maximum level for a member without groups", async () => {
        expect(await auth.getMemberAccessLevel("did:user", setup([]))).toBe(9999999);
        db.Members.docs = [];
        expect(await auth.getMemberAccessLevel("did:user", setup(undefined))).toBe(9999999);
    });

    test("returns the maximum level when the circle no longer exists", async () => {
        const circleId = new ObjectId().toString();
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:user", circleType: "user" });
        seedMember("did:user", circleId, ["admins"]);

        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(9999999);
    });

    test("treats groups the circle does not define as the maximum level", async () => {
        const circleId = setup(["ghost", "members"]);
        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(3);
        db.Members.docs = [];
        seedMember("did:user", circleId, ["ghost"]);
        expect(await auth.getMemberAccessLevel("did:user", circleId)).toBe(9999999);
    });

    test("treats every group as the maximum level when the circle defines none", async () => {
        expect(await auth.getMemberAccessLevel("did:user", setup(["admins"], null))).toBe(9999999);
    });
});

describe("hasHigherAccess", () => {
    const setup = () => {
        const circleId = seedCircle({
            userGroups: [
                { handle: "admins", accessLevel: 1 },
                { handle: "members", accessLevel: 3 },
            ],
        });
        for (const [did, groups] of [
            ["did:admin", ["admins"]],
            ["did:admin2", ["admins"]],
            ["did:member", ["members"]],
        ] as const) {
            db.Circles.docs.push({ _id: new ObjectId(), did, circleType: "user" });
            seedMember(did, circleId, [...groups]);
        }
        return circleId.toString();
    };

    test("an admin has higher access than a member", async () => {
        expect(await auth.hasHigherAccess("did:admin", "did:member", setup(), false)).toBe(true);
    });

    test("a member does not have higher access than an admin", async () => {
        expect(await auth.hasHigherAccess("did:member", "did:admin", setup(), false)).toBe(false);
        expect(await auth.hasHigherAccess("did:member", "did:admin", setup(), true)).toBe(false);
    });

    test("equal levels only count when same-level access is accepted", async () => {
        const circleId = setup();
        expect(await auth.hasHigherAccess("did:admin", "did:admin2", circleId, false)).toBe(false);
        expect(await auth.hasHigherAccess("did:admin", "did:admin2", circleId, true)).toBe(true);
    });

    test("compares against the maximum level for a stranger", async () => {
        const circleId = setup();
        expect(await auth.hasHigherAccess("did:member", "did:stranger", circleId, false)).toBe(true);
        expect(await auth.hasHigherAccess("did:stranger", "did:stranger2", circleId, false)).toBe(false);
        expect(await auth.hasHigherAccess("did:stranger", "did:stranger2", circleId, true)).toBe(true);
    });
});

// --- sessions ---------------------------------------------------------------------------------

describe("getAuthenticatedUserDid", () => {
    test("returns undefined when there is no auth cookie", async () => {
        expect(await auth.getAuthenticatedUserDid()).toBeUndefined();
    });

    test("returns the did stored in a valid session token", async () => {
        const { generateUserToken } = await import("./jwt");
        cookieJar.set("circles_token", await generateUserToken("did:alice"));

        expect(await auth.getAuthenticatedUserDid()).toBe("did:alice");
    });

    test("reads the legacy token cookie as a fallback", async () => {
        const { generateUserToken } = await import("./jwt");
        cookieJar.set("token", await generateUserToken("did:legacy"));

        expect(await auth.getAuthenticatedUserDid()).toBe("did:legacy");
    });

    test("returns undefined for a valid token that carries no user did", async () => {
        const { SignJWT } = await import("jose");
        const token = await new SignJWT({ other: "claim" })
            .setProtectedHeader({ alg: "HS256" })
            .sign(new TextEncoder().encode(process.env.CIRCLES_JWT_SECRET!));
        cookieJar.set("circles_token", token);

        expect(await auth.getAuthenticatedUserDid()).toBeUndefined();
    });

    test("throws for an invalid token rather than treating the user as signed out", async () => {
        cookieJar.set("circles_token", "not-a-jwt");

        await expect(auth.getAuthenticatedUserDid()).rejects.toThrow();
    });

    test("throws for a token signed with another secret", async () => {
        const { SignJWT } = await import("jose");
        cookieJar.set(
            "circles_token",
            await new SignJWT({ userDid: "did:mallory" })
                .setProtectedHeader({ alg: "HS256" })
                .sign(new TextEncoder().encode("another-secret")),
        );

        await expect(auth.getAuthenticatedUserDid()).rejects.toThrow();
    });
});

describe("createUserSession", () => {
    test("creates a signed token for the did and stores it in the session cookie", async () => {
        const token = await auth.createUserSession({} as never, "did:alice");

        expect(cookieSet).toHaveBeenCalledTimes(1);
        expect(cookieSet.mock.calls[0][0]).toBe("circles_token");
        expect(cookieSet.mock.calls[0][1]).toBe(token);
        expect(await (await import("./jwt")).verifyUserToken(token)).toMatchObject({ userDid: "did:alice" });
    });

    test("produces a session the authenticated-user lookup accepts", async () => {
        await auth.createUserSession({} as never, "did:alice");
        cookieJar.set("circles_token", cookieSet.mock.calls[0][1]);

        expect(await auth.getAuthenticatedUserDid()).toBe("did:alice");
    });
});

// --- authorization ----------------------------------------------------------------------------

describe("isAuthorized", () => {
    test("denies when the circle does not exist", async () => {
        expect(await auth.isAuthorized("did:user", new ObjectId().toString(), featureFixture())).toBe(false);
    });

    test("allows everyone when the default groups include everyone", async () => {
        const circleId = seedCircle();
        const view = featureFixture({ handle: "view", defaultUserGroups: ["everyone"] });

        expect(await auth.isAuthorized(undefined, circleId.toString(), view)).toBe(true);
        expect(await auth.isAuthorized("did:stranger", circleId.toString(), view)).toBe(true);
    });

    test("denies anonymous visitors when everyone is not allowed", async () => {
        const circleId = seedCircle();
        expect(await auth.isAuthorized(undefined, circleId.toString(), featureFixture())).toBe(false);
    });

    test("denies signed-in users who are not members", async () => {
        const circleId = seedCircle();
        expect(await auth.isAuthorized("did:stranger", circleId.toString(), featureFixture())).toBe(false);
    });

    test("allows members whose groups intersect the default groups", async () => {
        const circleId = seedCircle();
        seedMember("did:member", circleId, ["members"]);

        expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(true);
    });

    test("denies members whose groups do not intersect the allowed groups", async () => {
        const circleId = seedCircle();
        seedMember("did:member", circleId, ["moderators"]);

        expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(false);
    });

    test("denies members that have no groups", async () => {
        const circleId = seedCircle();
        seedMember("did:none", circleId, undefined);
        seedMember("did:empty", circleId, []);

        expect(await auth.isAuthorized("did:none", circleId.toString(), featureFixture())).toBe(false);
        expect(await auth.isAuthorized("did:empty", circleId.toString(), featureFixture())).toBe(false);
    });

    test("only counts memberships of the circle being checked", async () => {
        const circleId = seedCircle();
        seedMember("did:member", new ObjectId(), ["members"]);

        expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(false);
    });

    describe("access rules", () => {
        test("circle access rules override the feature defaults", async () => {
            const circleId = seedCircle({ accessRules: { feed: { post: ["admins"] } } });
            seedMember("did:member", circleId, ["members"]);
            seedMember("did:admin", circleId, ["admins"]);

            expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(false);
            expect(await auth.isAuthorized("did:admin", circleId.toString(), featureFixture())).toBe(true);
        });

        test("a circle rule that includes everyone allows anonymous visitors", async () => {
            const circleId = seedCircle({ accessRules: { feed: { post: ["everyone"] } } });

            expect(await auth.isAuthorized(undefined, circleId.toString(), featureFixture())).toBe(true);
        });

        test("an empty circle rule denies everybody, even when the default would allow", async () => {
            const circleId = seedCircle({ accessRules: { feed: { post: [] } } });
            seedMember("did:member", circleId, ["members"]);

            expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(false);
        });

        test("falls back to the feature defaults when the circle has no rule for the feature", async () => {
            const circleId = seedCircle({ accessRules: { feed: { other: ["admins"] }, tasks: { post: ["admins"] } } });
            seedMember("did:member", circleId, ["members"]);

            expect(await auth.isAuthorized("did:member", circleId.toString(), featureFixture())).toBe(true);
        });

        test("denies when neither the circle nor the feature define groups", async () => {
            const circleId = seedCircle();
            seedMember("did:member", circleId, ["members"]);

            expect(
                await auth.isAuthorized("did:member", circleId.toString(), featureFixture({ defaultUserGroups: undefined })),
            ).toBe(false);
        });
    });

    describe("circle lifecycle", () => {
        test.each([
            ["active", true, true],
            [undefined, true, true],
            ["paused", true, false],
            ["suspended", false, false],
            ["removed", false, false],
        ] as const)("a %s circle allows viewing: %p, writing: %p", async (moderationStatus, canView, canWrite) => {
            const circleId = seedCircle({ moderationStatus });
            const view = featureFixture({ handle: "view", defaultUserGroups: ["everyone"] });
            const post = featureFixture({ handle: "post", defaultUserGroups: ["everyone"] });

            expect(await auth.isAuthorized(undefined, circleId.toString(), view)).toBe(canView);
            expect(await auth.isAuthorized(undefined, circleId.toString(), post)).toBe(canWrite);
        });

        test("personal profiles are always readable and writable regardless of moderation status", async () => {
            const circleId = seedCircle({ circleType: "user", moderationStatus: "suspended" });
            const view = featureFixture({ handle: "view", defaultUserGroups: ["everyone"] });
            const post = featureFixture({ handle: "post", defaultUserGroups: ["everyone"] });

            expect(await auth.isAuthorized(undefined, circleId.toString(), view)).toBe(true);
            expect(await auth.isAuthorized(undefined, circleId.toString(), post)).toBe(true);
        });

        test("treats only a feature named 'view' as a read", async () => {
            const circleId = seedCircle({ moderationStatus: "paused" });
            const viewLike = featureFixture({ handle: "view_all", defaultUserGroups: ["everyone"] });

            expect(await auth.isAuthorized(undefined, circleId.toString(), viewLike)).toBe(false);
        });
    });

    describe("features that require participation", () => {
        const guarded = () => featureFixture({ needsToBeVerified: true, defaultUserGroups: ["members"] });

        test("denies a member who cannot participate yet", async () => {
            const circleId = seedCircle();
            db.Circles.docs.push(participatingUser("did:new", { isEmailVerified: false }));
            seedMember("did:new", circleId, ["members"]);

            expect(await auth.isAuthorized("did:new", circleId.toString(), guarded())).toBe(false);
        });

        test("allows a member who can participate", async () => {
            const circleId = seedCircle();
            db.Circles.docs.push(participatingUser("did:ready"));
            seedMember("did:ready", circleId, ["members"]);

            expect(await auth.isAuthorized("did:ready", circleId.toString(), guarded())).toBe(true);
        });

        test("denies a signed-in did that has no profile", async () => {
            const circleId = seedCircle();
            seedMember("did:ghost", circleId, ["members"]);

            expect(await auth.isAuthorized("did:ghost", circleId.toString(), guarded())).toBe(false);
        });

        test("admins bypass the participation requirement", async () => {
            const circleId = seedCircle();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:admin", circleType: "user", isAdmin: true });
            seedMember("did:admin", circleId, ["members"]);

            expect(await auth.isAuthorized("did:admin", circleId.toString(), guarded())).toBe(true);
        });

        test("does not check participation for anonymous visitors, so public defaults still apply", async () => {
            const circleId = seedCircle();
            const publicGuarded = featureFixture({ needsToBeVerified: true, defaultUserGroups: ["everyone"] });

            expect(await auth.isAuthorized(undefined, circleId.toString(), publicGuarded)).toBe(true);
        });

        describe("settings features", () => {
            const settings = () => featureFixture({ module: "settings", handle: "edit", needsToBeVerified: true, defaultUserGroups: ["admins"] });

            test("lets someone edit their own profile settings before completing their profile", async () => {
                const ownerId = new ObjectId();
                db.Circles.docs.push({ _id: ownerId, did: "did:owner", circleType: "user", isEmailVerified: false });
                seedMember("did:owner", ownerId, ["admins"]);

                expect(await auth.isAuthorized("did:owner", ownerId.toString(), settings())).toBe(true);
            });

            test("lets the creator of a circle edit its settings before completing their profile", async () => {
                const circleId = seedCircle({ createdBy: "did:creator" });
                db.Circles.docs.push({ _id: new ObjectId(), did: "did:creator", circleType: "user", isEmailVerified: false });
                seedMember("did:creator", circleId, ["admins"]);

                expect(await auth.isAuthorized("did:creator", circleId.toString(), settings())).toBe(true);
            });

            test("still requires the right group even for the creator", async () => {
                const circleId = seedCircle({ createdBy: "did:creator" });
                db.Circles.docs.push({ _id: new ObjectId(), did: "did:creator", circleType: "user", isEmailVerified: false });
                seedMember("did:creator", circleId, ["members"]);

                expect(await auth.isAuthorized("did:creator", circleId.toString(), settings())).toBe(false);
            });

            test("does not extend the exemption to other users or to non-settings features", async () => {
                const circleId = seedCircle({ createdBy: "did:creator" });
                db.Circles.docs.push({ _id: new ObjectId(), did: "did:other", circleType: "user", isEmailVerified: false });
                seedMember("did:other", circleId, ["admins"]);

                expect(await auth.isAuthorized("did:other", circleId.toString(), settings())).toBe(false);

                db.Circles.docs.push({ _id: new ObjectId(), did: "did:creator", circleType: "user", isEmailVerified: false });
                seedMember("did:creator", circleId, ["admins"]);
                const notSettings = featureFixture({ module: "feed", needsToBeVerified: true, defaultUserGroups: ["admins"] });
                expect(await auth.isAuthorized("did:creator", circleId.toString(), notSettings)).toBe(false);
            });
        });
    });
});

describe("getAuthorizedMembers", () => {
    const circle = (overrides: Record<string, unknown> = {}) => ({ _id: "circle-1", ...overrides }) as unknown as Circle;
    const members = [
        { userDid: "did:admin", userGroups: ["admins", "members"] },
        { userDid: "did:member", userGroups: ["members"] },
        { userDid: "did:nogroups" },
    ];

    beforeEach(() => {
        getMembers.mockResolvedValue(members);
        getCirclesByDids.mockImplementation(async (dids) => dids.map((did) => ({ did })));
    });

    test("loads the circle when given an id", async () => {
        getCircleById.mockResolvedValue(circle());

        await auth.getAuthorizedMembers("circle-1", featureFixture());

        expect(getCircleById).toHaveBeenCalledWith("circle-1");
        expect(getMembers).toHaveBeenCalledWith("circle-1");
    });

    test("does not reload a circle object it was given", async () => {
        await auth.getAuthorizedMembers(circle(), featureFixture());

        expect(getCircleById).not.toHaveBeenCalled();
    });

    test("returns the profiles of members in the default allowed groups", async () => {
        const result = await auth.getAuthorizedMembers(circle(), featureFixture({ defaultUserGroups: ["admins"] }));

        expect(getCirclesByDids).toHaveBeenCalledWith(["did:admin"]);
        expect(result).toEqual([{ did: "did:admin" }]);
    });

    test("uses the circle's access rules over the feature defaults", async () => {
        const result = await auth.getAuthorizedMembers(
            circle({ accessRules: { feed: { post: ["members"] } } }),
            featureFixture({ defaultUserGroups: ["admins"] }),
        );

        expect(result).toEqual([{ did: "did:admin" }, { did: "did:member" }]);
    });

    test("returns every member when everyone is allowed, including members without groups", async () => {
        await auth.getAuthorizedMembers(circle(), featureFixture({ defaultUserGroups: ["everyone"] }));

        expect(getCirclesByDids).toHaveBeenCalledWith(["did:admin", "did:member", "did:nogroups"]);
    });

    test("returns nobody when neither the circle nor the feature name any groups", async () => {
        await auth.getAuthorizedMembers(circle(), featureFixture({ defaultUserGroups: undefined }));

        expect(getCirclesByDids).toHaveBeenCalledWith([]);
    });

    test("returns nobody when the allowed groups list is empty", async () => {
        await auth.getAuthorizedMembers(circle({ accessRules: { feed: { post: [] } } }), featureFixture());

        expect(getCirclesByDids).toHaveBeenCalledWith([]);
    });
});
