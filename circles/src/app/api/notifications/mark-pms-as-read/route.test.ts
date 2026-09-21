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
const seed = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Notifications.docs.push({ _id, userId: "did:user", type: "pm_received", isRead: false, content: { roomId: "room-1" }, ...overrides });
    return _id;
};
const isRead = (id: ObjectId) => db.Notifications.byId(id)!.isRead;
const mark = (body: unknown) => POST(createJsonRequest(body));

beforeEach(() => {
    db.Notifications.docs = [];
});


describe("POST /api/notifications/mark-pms-as-read", () => {
    test("marks the user's unread private message notifications of the room as read and counts them", async () => {
        const first = seed();
        const second = seed();

        const response = await mark({ roomId: "room-1" });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, updatedCount: 2 });
        expect(isRead(first)).toBe(true);
        expect(isRead(second)).toBe(true);
    });

    test("leaves notifications of other rooms alone", async () => {
        const other = seed({ content: { roomId: "room-2" } });

        await mark({ roomId: "room-1" });

        expect(isRead(other)).toBe(false);
    });

    test("leaves other users' notifications alone", async () => {
        const other = seed({ userId: "did:other" });

        await mark({ roomId: "room-1" });

        expect(isRead(other)).toBe(false);
    });

    test("leaves notifications that are not private messages alone", async () => {
        const comment = seed({ type: "comment" });

        await mark({ roomId: "room-1" });

        expect(isRead(comment)).toBe(false);
    });

    test("does not count notifications that were already read", async () => {
        seed({ isRead: true });

        expect(await (await mark({ roomId: "room-1" })).json()).toEqual({ success: true, updatedCount: 0 });
    });

    test("reports zero for a room without notifications", async () => {
        expect(await (await mark({ roomId: "room-9" })).json()).toEqual({ success: true, updatedCount: 0 });
    });

    test.each([
        ["missing", {}],
        ["empty", { roomId: "" }],
        ["null", { roomId: null }],
    ])("requires a room id (%s)", async (_label, body) => {
        const response = await mark(body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Room ID is required" });
    });

    test("returns a generic 500 for a body that is not JSON, and logs the error", async () => {
        const response = await POST(createJsonRequest("{broken"));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error marking PM notifications as read:", expect.any(Error));
    });

    test("rejects signed-out callers and changes nothing", async () => {
        const id = seed();
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await mark({ roomId: "room-1" });

        expect(response.status).toBe(401);
        expect(isRead(id)).toBe(false);
    });
});
