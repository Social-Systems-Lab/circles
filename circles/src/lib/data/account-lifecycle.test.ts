import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { activateUserAccount } = await import("./account-lifecycle");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, circleType: "user", accountStatus: "pending_verification", ...overrides });
    return _id;
};
const stored = (id: ObjectId) => db.Circles.byId(id)!;

beforeEach(() => {
    db.Circles.docs = [];
});

describe("activateUserAccount", () => {
    test("marks the user as verified by the verifier and activates the account", async () => {
        const id = seedUser();

        await activateUserAccount(id, "did:admin");

        expect(stored(id)).toMatchObject({
            isVerified: true,
            verificationStatus: "verified",
            verifiedAt: NOW,
            verifiedBy: "did:admin",
            accountStatus: "active",
        });
    });

    test("accepts the user id as a string", async () => {
        const id = seedUser();

        await activateUserAccount(id.toString(), "did:admin");

        expect(stored(id).accountStatus).toBe("active");
    });

    test("returns the founding member number of the user", async () => {
        const id = seedUser({ foundingMemberNumber: 7 });

        expect(await activateUserAccount(id, "did:admin")).toEqual({ foundingNumber: 7 });
    });

    test("returns a null founding number when the user has none", async () => {
        const id = seedUser();

        expect(await activateUserAccount(id, "did:admin")).toEqual({ foundingNumber: null });
    });

    test("keeps a founding member number of zero rather than treating it as missing", async () => {
        const id = seedUser({ foundingMemberNumber: 0 });

        expect(await activateUserAccount(id, "did:admin")).toEqual({ foundingNumber: 0 });
    });

    test("does not change the founding member number", async () => {
        const id = seedUser({ foundingMemberNumber: 7 });

        await activateUserAccount(id, "did:admin");

        expect(stored(id).foundingMemberNumber).toBe(7);
    });

    test("throws when the user does not exist", async () => {
        await expect(activateUserAccount(new ObjectId(), "did:admin")).rejects.toThrow("User not found");
    });

    test("throws for circles that are not user profiles and leaves them untouched", async () => {
        const id = seedUser({ circleType: "circle" });

        await expect(activateUserAccount(id, "did:admin")).rejects.toThrow("User not found");
        expect(stored(id).accountStatus).toBe("pending_verification");
    });

    test("only activates the requested user", async () => {
        const target = seedUser();
        const other = seedUser();

        await activateUserAccount(target, "did:admin");

        expect(stored(other).accountStatus).toBe("pending_verification");
        expect(stored(other).isVerified).toBeUndefined();
    });

    test("is idempotent apart from refreshing the verification time", async () => {
        const id = seedUser();
        await activateUserAccount(id, "did:admin");
        setSystemTime(new Date(NOW.getTime() + 1000));

        await activateUserAccount(id, "did:other-admin");

        expect(stored(id)).toMatchObject({ accountStatus: "active", verifiedBy: "did:other-admin" });
    });

    test("throws for a string that is not a valid ObjectId", async () => {
        await expect(activateUserAccount("not-an-id", "did:admin")).rejects.toThrow();
    });
});
