import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { getStoredObjectAccess } = await import("./media-access");

const seedOwner = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, circleType: "circle", ...overrides });
    return _id.toString();
};

beforeEach(() => {
    db.Circles.docs = [];
});

describe("getStoredObjectAccess", () => {
    describe("objects that do not belong to a circle", () => {
        test.each(["logo.png", "static/logo.png", "not-an-id/file.png", "", "12345/file"])(
            "are public: %p",
            async (name) => {
                expect(await getStoredObjectAccess(name)).toBe("public");
            },
        );

        test("do not hit the database", async () => {
            const findOne = mock(async () => null);
            db.Circles.findOne = findOne as never;

            await getStoredObjectAccess("logo.png");

            expect(findOne).not.toHaveBeenCalled();
            delete (db.Circles as { findOne?: unknown }).findOne;
        });
    });

    describe("objects owned by a circle id", () => {
        test("are public when the owner is a user profile", async () => {
            const id = seedOwner({ circleType: "user", moderationStatus: "removed" });

            expect(await getStoredObjectAccess(`${id}/avatar.png`)).toBe("public");
        });

        test("are public when the owner no longer exists", async () => {
            expect(await getStoredObjectAccess(`${new ObjectId()}/avatar.png`)).toBe("public");
        });

        test.each([undefined, "active", "paused"])("are public when the owning circle is %p", async (moderationStatus) => {
            const id = seedOwner({ moderationStatus });

            expect(await getStoredObjectAccess(`${id}/cover.png`)).toBe("public");
        });

        test.each(["suspended", "removed"])("are denied when the owning circle is %s", async (moderationStatus) => {
            const id = seedOwner({ moderationStatus });

            expect(await getStoredObjectAccess(`${id}/cover.png`)).toBe("denied");
        });

        test("are governed by the owner even for deeply nested keys", async () => {
            const id = seedOwner({ moderationStatus: "removed" });

            expect(await getStoredObjectAccess(`${id}/a/b/c.png`)).toBe("denied");
        });

        test("treat an owner id without a file as an owner lookup", async () => {
            const id = seedOwner({ moderationStatus: "removed" });

            expect(await getStoredObjectAccess(id)).toBe("denied");
        });

        test("only reads the fields needed for the decision", async () => {
            const id = seedOwner();
            const original = db.Circles.findOne.bind(db.Circles);
            const seen: unknown[] = [];
            db.Circles.findOne = (async (...args: Parameters<typeof original>) => {
                seen.push(args);
                return original(...args);
            }) as never;

            await getStoredObjectAccess(`${id}/cover.png`);

            expect(seen).toEqual([[{ _id: new ObjectId(id) }, { projection: { circleType: 1, moderationStatus: 1 } }]]);
            delete (db.Circles as { findOne?: unknown }).findOne;
        });
    });
});
