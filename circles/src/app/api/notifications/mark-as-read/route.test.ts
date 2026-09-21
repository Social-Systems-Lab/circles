import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { mockDb } from "@/test/mock-db";
import { createJsonRequest } from "@/test/next-request";

const db = mockDb();

const getAuthenticatedUserDid = mockAuthenticatedUser();

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");
const seed = (userId: string, isRead = false) => {
    const _id = new ObjectId();
    db.Notifications.docs.push({ _id, userId, isRead });
    return _id;
};
const stored = (id: ObjectId) => db.Notifications.byId(id)!;
const mark = (body: unknown) => POST(createJsonRequest(body));

beforeEach(() => {
    db.Notifications.docs = [];
});


describe("POST /api/notifications/mark-as-read", () => {
    test("marks the user's notification as read", async () => {
        const id = seed("did:user");

        const response = await mark({ notificationId: id.toString() });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(stored(id).isRead).toBe(true);
    });

    test("succeeds for a notification that is already read", async () => {
        const id = seed("did:user", true);

        expect((await mark({ notificationId: id.toString() })).status).toBe(200);
    });

    test("does not let a user mark someone else's notification", async () => {
        const id = seed("did:other");

        const response = await mark({ notificationId: id.toString() });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Notification not found or user mismatch" });
        expect(stored(id).isRead).toBe(false);
    });

    test("reports an unknown notification", async () => {
        expect((await mark({ notificationId: new ObjectId().toString() })).status).toBe(404);
    });

    test("only changes the requested notification", async () => {
        const target = seed("did:user");
        const other = seed("did:user");

        await mark({ notificationId: target.toString() });

        expect(stored(other).isRead).toBe(false);
    });

    test.each([
        ["missing", {}],
        ["empty", { notificationId: "" }],
        ["null", { notificationId: null }],
    ])("requires a notification id (%s)", async (_label, body) => {
        const response = await mark(body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Notification ID is required" });
    });

    test("returns a generic 500 for an id that is not an ObjectId, and logs the error", async () => {
        const response = await mark({ notificationId: "not-an-id" });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error marking notification as read:", expect.any(Error));
    });

    test("returns a generic 500 for a body that is not JSON", async () => {
        expect((await POST(createJsonRequest("{broken"))).status).toBe(500);
    });

    test("rejects signed-out callers and changes nothing", async () => {
        const id = seed("did:user");
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await mark({ notificationId: id.toString() });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(stored(id).isRead).toBe(false);
    });
});
