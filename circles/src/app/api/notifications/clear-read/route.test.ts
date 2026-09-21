import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const getAuthenticatedUserDid = mockAuthenticatedUser();

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");
const seed = (userId: string, isRead: boolean) => db.Notifications.docs.push({ _id: new ObjectId(), userId, isRead });

beforeEach(() => {
    db.Notifications.docs = [];
});


describe("POST /api/notifications/clear-read", () => {
    test("deletes the read notifications of the signed-in user and reports how many", async () => {
        seed("did:user", true);
        seed("did:user", true);

        const response = await POST();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, deletedCount: 2 });
        expect(db.Notifications.docs).toHaveLength(0);
    });

    test("keeps unread notifications", async () => {
        seed("did:user", true);
        seed("did:user", false);

        await POST();

        expect(db.Notifications.docs).toHaveLength(1);
        expect(db.Notifications.docs[0].isRead).toBe(false);
    });

    test("never touches other users' notifications", async () => {
        seed("did:user", true);
        seed("did:other", true);

        await POST();

        expect(db.Notifications.docs.map((doc) => doc.userId)).toEqual(["did:other"]);
    });

    test("reports zero when there is nothing to clear", async () => {
        expect(await (await POST()).json()).toEqual({ success: true, deletedCount: 0 });
    });

    test("rejects signed-out callers and deletes nothing", async () => {
        seed("did:user", true);
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await POST();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(db.Notifications.docs).toHaveLength(1);
    });

    test("returns a generic 500 when the delete fails, and logs the error", async () => {
        const spy = spyOn(db.Notifications, "deleteMany").mockRejectedValue(new Error("db down"));

        const response = await POST();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error clearing read notifications:", expect.any(Error));
        spy.mockRestore();
    });
});
