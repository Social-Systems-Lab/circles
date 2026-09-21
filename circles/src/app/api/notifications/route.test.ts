import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { createRequest } from "@/test/next-request";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const listNotificationsForUser = mock(async (_did: string, _limit: number, _options: unknown): Promise<Record<string, unknown>[]> => []);
const getUnreadNotificationCountForUser = mock(async (_did: string, _options: unknown): Promise<number> => 0);
mock.module("@/lib/data/notifications", () => ({ listNotificationsForUser, getUnreadNotificationCountForUser }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");
const get = (query = "") => GET(createRequest(`/api/notifications${query}`));

beforeEach(() => {
    listNotificationsForUser.mockReset();
    listNotificationsForUser.mockResolvedValue([]);
    getUnreadNotificationCountForUser.mockReset();
    getUnreadNotificationCountForUser.mockResolvedValue(0);
});


describe("GET /api/notifications", () => {
    test("rejects signed-out callers without loading anything", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await get();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(listNotificationsForUser).not.toHaveBeenCalled();
    });

    test("returns the notifications and the unread count", async () => {
        listNotificationsForUser.mockResolvedValue([{ _id: "n1", type: "comment" }]);
        getUnreadNotificationCountForUser.mockResolvedValue(4);

        const response = await get();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ notifications: [{ _id: "n1", type: "comment" }], unreadCount: 4 });
    });

    test("serializes ObjectId ids as strings", async () => {
        const id = new ObjectId();
        listNotificationsForUser.mockResolvedValue([{ _id: id, type: "comment" }]);

        expect((await (await get()).json()).notifications[0]._id).toBe(id.toString());
    });

    test("keeps notifications that have no id", async () => {
        listNotificationsForUser.mockResolvedValue([{ type: "comment" }]);

        expect((await (await get()).json()).notifications).toEqual([{ type: "comment" }]);
    });

    test("keeps the order returned by the store", async () => {
        listNotificationsForUser.mockResolvedValue([{ _id: "b" }, { _id: "a" }]);

        expect((await (await get()).json()).notifications.map((n: { _id: string }) => n._id)).toEqual(["b", "a"]);
    });

    test("leaves private message notifications to the chat, for both the list and the count", async () => {
        await get();

        expect(listNotificationsForUser).toHaveBeenCalledWith("did:user", 50, { excludeTypes: ["pm_received"] });
        expect(getUnreadNotificationCountForUser).toHaveBeenCalledWith("did:user", { excludeTypes: ["pm_received"] });
    });

    describe("limit", () => {
        test.each([
            ["", 50],
            ["?limit=20", 20],
            ["?limit=100", 100],
            ["?limit=101", 100],
            ["?limit=5000", 100],
            ["?limit=0", 1],
            ["?limit=-3", 1],
            ["?limit=2.5", 2.5],
            ["?limit=abc", 50],
            ["?limit=", 50],
            ["?limit=Infinity", 50],
        ])("with %p uses a limit of %d", async (query, expected) => {
            await get(query);

            expect(listNotificationsForUser.mock.calls[0][1]).toBe(expected);
        });
    });

    test.each([
        ["listing fails", () => listNotificationsForUser.mockRejectedValue(new Error("db down"))],
        ["counting fails", () => getUnreadNotificationCountForUser.mockRejectedValue(new Error("db down"))],
    ])("returns a generic 500 when %s, and logs the error", async (_label, arrange) => {
        arrange();

        const response = await get();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error fetching notifications:", expect.any(Error));
    });
});
