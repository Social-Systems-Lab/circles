import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const getAuthenticatedUserDid = mockAuthenticatedUser(null);

const { isSuperAdminDid, requireSuperAdmin } = await import("./superadmin");

const seedUser = (overrides: Record<string, unknown>) =>
    db.Circles.docs.push({ _id: new ObjectId(), circleType: "user", ...overrides });

beforeEach(() => {
    db.Circles.docs = [];
});

describe("isSuperAdminDid", () => {
    test("is false without a did, without querying the database", async () => {
        seedUser({ did: "did:admin", isAdmin: true });

        expect(await isSuperAdminDid(undefined)).toBe(false);
        expect(await isSuperAdminDid("")).toBe(false);
    });

    test("is true for a user profile flagged as admin", async () => {
        seedUser({ did: "did:admin", isAdmin: true });

        expect(await isSuperAdminDid("did:admin")).toBe(true);
    });

    test("is false for a user without the admin flag", async () => {
        seedUser({ did: "did:user" });
        seedUser({ did: "did:false", isAdmin: false });

        expect(await isSuperAdminDid("did:user")).toBe(false);
        expect(await isSuperAdminDid("did:false")).toBe(false);
    });

    test("requires the admin flag to be exactly true", async () => {
        seedUser({ did: "did:truthy", isAdmin: "yes" });
        seedUser({ did: "did:one", isAdmin: 1 });

        expect(await isSuperAdminDid("did:truthy")).toBe(false);
        expect(await isSuperAdminDid("did:one")).toBe(false);
    });

    test("is false for an unknown did", async () => {
        expect(await isSuperAdminDid("did:nobody")).toBe(false);
    });

    test("ignores admin flags on circles that are not user profiles", async () => {
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:circle", circleType: "circle", isAdmin: true });

        expect(await isSuperAdminDid("did:circle")).toBe(false);
    });

    test("only projects the admin flag", async () => {
        seedUser({ did: "did:admin", isAdmin: true, email: "secret@example.com" });
        const findOne = mock(db.Circles.findOne.bind(db.Circles));
        db.Circles.findOne = findOne as typeof db.Circles.findOne;

        await isSuperAdminDid("did:admin");

        expect(findOne).toHaveBeenCalledWith({ did: "did:admin", circleType: "user" }, { projection: { isAdmin: 1 } });
    });
});

describe("requireSuperAdmin", () => {
    test("returns the did of the authenticated superadmin", async () => {
        seedUser({ did: "did:admin", isAdmin: true });
        getAuthenticatedUserDid.mockResolvedValue("did:admin");

        expect(await requireSuperAdmin()).toBe("did:admin");
    });

    test("throws when nobody is signed in", async () => {
        await expect(requireSuperAdmin()).rejects.toThrow("Unauthorized: superadmin access required.");
    });

    test("throws when the signed-in user is not an admin", async () => {
        seedUser({ did: "did:user" });
        getAuthenticatedUserDid.mockResolvedValue("did:user");

        await expect(requireSuperAdmin()).rejects.toThrow("Unauthorized: superadmin access required.");
    });

    test("throws when the signed-in did has no profile", async () => {
        getAuthenticatedUserDid.mockResolvedValue("did:ghost");

        await expect(requireSuperAdmin()).rejects.toThrow("Unauthorized: superadmin access required.");
    });

    test("propagates authentication failures instead of swallowing them", async () => {
        getAuthenticatedUserDid.mockRejectedValue(new Error("bad token"));

        await expect(requireSuperAdmin()).rejects.toThrow("bad token");
    });
});
