import { beforeEach, describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const getUnreadNotificationCountForUser = mock(async (_did: string, _options: unknown): Promise<number> => 3);
mock.module("@/lib/data/notifications", () => ({ getUnreadNotificationCountForUser }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    getUnreadNotificationCountForUser.mockReset();
    getUnreadNotificationCountForUser.mockResolvedValue(3);
});


describe("GET /api/notifications/unread-count", () => {
    test("returns the unread count of the signed-in user, excluding private messages", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ unreadCount: 3 });
        expect(getUnreadNotificationCountForUser).toHaveBeenCalledWith("did:user", { excludeTypes: ["pm_received"] });
    });

    test("returns zero when there is nothing unread", async () => {
        getUnreadNotificationCountForUser.mockResolvedValue(0);

        expect(await (await GET()).json()).toEqual({ unreadCount: 0 });
    });

    test("rejects signed-out callers", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await GET();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(getUnreadNotificationCountForUser).not.toHaveBeenCalled();
    });

    test("returns a generic 500 when counting fails, and logs the error", async () => {
        getUnreadNotificationCountForUser.mockRejectedValue(new Error("db down"));

        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error fetching notification unread count:", expect.any(Error));
    });
});
