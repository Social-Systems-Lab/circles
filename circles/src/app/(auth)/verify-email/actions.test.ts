import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole, useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

mock.module("@/lib/data/email", () => ({ hashToken: (token: string) => `hashed:${token}` }));

const revalidatePath = mock((_path: string) => {});
mock.module("next/cache", () => ({ revalidatePath }));

const { verifyEmailAction } = await import("./actions");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const consoleSpy = silenceConsole("warn", "error");
const trackSpy = useSpyCleanup();

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({
        _id,
        did: "did:vee",
        handle: "vee",
        circleType: "user",
        isEmailVerified: false,
        emailVerificationToken: "hashed:good-token",
        emailVerificationTokenExpiry: new Date(NOW.getTime() + 3600 * 1000),
        ...overrides,
    });
    return _id;
};

beforeEach(() => {
    db.Circles.docs = [];
    revalidatePath.mockReset();
});

describe("verifyEmailAction", () => {
    describe("a valid link", () => {
        test("verifies the email and clears the token", async () => {
            const id = seedUser();

            const result = await verifyEmailAction("good-token");

            expect(result).toEqual({ success: true, message: "Email verified", handle: "vee" });
            expect(db.Circles.byId(id)).toMatchObject({ isEmailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiry: null });
        });

        test("looks the user up by the hash of the token, never the token itself", async () => {
            const id = seedUser({ emailVerificationToken: "good-token" });

            const result = await verifyEmailAction("good-token");

            expect(result.success).toBe(false);
            expect(db.Circles.byId(id)?.isEmailVerified).toBe(false);
        });

        test("refreshes the profile and subscription pages of the user", async () => {
            seedUser();

            await verifyEmailAction("good-token");

            expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/circles/vee", "/circles/vee/settings/subscription"]);
        });

        test("only verifies the user that owns the token", async () => {
            seedUser();
            const other = seedUser({ did: "did:other", emailVerificationToken: "hashed:other-token" });

            await verifyEmailAction("good-token");

            expect(db.Circles.byId(other)?.isEmailVerified).toBe(false);
        });

        test("still succeeds when refreshing the pages fails, and logs it", async () => {
            seedUser();
            revalidatePath.mockImplementation(() => {
                throw new Error("no static generation store");
            });

            const result = await verifyEmailAction("good-token");

            expect(result.success).toBe(true);
            expect(consoleSpy.warn).toHaveBeenCalledWith("Failed to revalidate user path after email verification:", expect.any(Error));
        });

        test("does not refresh pages when the account has no handle", async () => {
            seedUser({ handle: undefined });

            const result = await verifyEmailAction("good-token");

            expect(result).toMatchObject({ success: true, handle: undefined });
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("links that cannot be used", () => {
        test.each([[""], [undefined as unknown as string]])("rejects a missing token (%p)", async (token) => {
            seedUser();

            expect(await verifyEmailAction(token)).toEqual({ success: false, message: "Verification token is missing." });
        });

        test("rejects a token nobody has", async () => {
            seedUser();

            expect(await verifyEmailAction("wrong-token")).toEqual({ success: false, message: "Invalid or expired verification token." });
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        test("rejects an expired link, clears it, and does not verify the email", async () => {
            const id = seedUser({ emailVerificationTokenExpiry: new Date(NOW.getTime() - 1) });

            const result = await verifyEmailAction("good-token");

            expect(result).toEqual({ success: false, message: "This email verification link has expired. Please request a new one." });
            expect(db.Circles.byId(id)).toMatchObject({ isEmailVerified: false, emailVerificationToken: null, emailVerificationTokenExpiry: null });
        });

        test("treats the exact moment of expiry as expired", async () => {
            seedUser({ emailVerificationTokenExpiry: NOW });

            expect((await verifyEmailAction("good-token")).message).toContain("expired");
        });

        test("treats a link without an expiry as expired", async () => {
            seedUser({ emailVerificationTokenExpiry: undefined });

            expect((await verifyEmailAction("good-token")).message).toContain("expired");
        });

        test("tells the user a used link was already used, and clears the token", async () => {
            const id = seedUser({ isEmailVerified: true });

            const result = await verifyEmailAction("good-token");

            expect(result).toEqual({
                success: false,
                message: "This email verification link has already been used. You can log in.",
                handle: "vee",
            });
            expect(db.Circles.byId(id)?.emailVerificationToken).toBeNull();
        });

        test("refuses accounts without an identity", async () => {
            const id = seedUser({ did: undefined });

            const result = await verifyEmailAction("good-token");

            expect(result).toEqual({ success: false, message: "Could not verify this account. Please contact support." });
            expect(db.Circles.byId(id)?.isEmailVerified).toBe(false);
        });

        test("cannot be replayed once used", async () => {
            seedUser();

            expect((await verifyEmailAction("good-token")).success).toBe(true);
            expect((await verifyEmailAction("good-token")).message).toBe("Invalid or expired verification token.");
        });
    });

    describe("races and failures", () => {
        test("reports a failure, with a warning, when the account was verified by someone else in the meantime", async () => {
            const id = seedUser();
            const original = db.Circles.updateOne.bind(db.Circles);
            trackSpy(
                spyOn(db.Circles, "updateOne").mockImplementation(async (filter, update, options) => {
                    // Another request rotates the token between the lookup and the conditional update.
                    if ("isEmailVerified" in filter) db.Circles.byId(id)!.emailVerificationToken = "hashed:rotated-token";
                    return original(filter, update, options);
                }),
            );

            const result = await verifyEmailAction("good-token");

            expect(result).toEqual({ success: false, message: "Could not update email verification status. Please try again." });
            expect(consoleSpy.warn).toHaveBeenCalledWith(`Failed to update email verification status for user ${id.toString()}, but token was valid.`);
        });

        test("returns a generic error, and logs, when the database fails", async () => {
            seedUser();
            trackSpy(spyOn(db.Circles, "findOne").mockRejectedValue(new Error("db down")));

            expect(await verifyEmailAction("good-token")).toEqual({ success: false, message: "An unexpected error occurred during email verification." });
            expect(consoleSpy.error).toHaveBeenCalledWith("Error during email verification:", expect.any(Error));
        });
    });
});
