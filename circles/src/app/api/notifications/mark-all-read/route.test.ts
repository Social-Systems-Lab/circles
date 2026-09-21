import { beforeEach, describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const markAllNotificationsReadForUser = mock(async (_did: string): Promise<{ modifiedCount: number }> => ({ modifiedCount: 5 }));
mock.module("@/lib/data/notifications", () => ({ markAllNotificationsReadForUser }));

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    markAllNotificationsReadForUser.mockReset();
    markAllNotificationsReadForUser.mockResolvedValue({ modifiedCount: 5 });
});


describe("POST /api/notifications/mark-all-read", () => {
    test("marks everything read for the signed-in user and reports how many changed", async () => {
        const response = await POST();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, updatedCount: 5 });
        expect(markAllNotificationsReadForUser).toHaveBeenCalledWith("did:user");
    });

    test("reports zero when nothing was unread", async () => {
        markAllNotificationsReadForUser.mockResolvedValue({ modifiedCount: 0 });

        expect(await (await POST()).json()).toEqual({ success: true, updatedCount: 0 });
    });

    test("rejects signed-out callers", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await POST();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(markAllNotificationsReadForUser).not.toHaveBeenCalled();
    });

    test("returns a generic 500 when the update fails, and logs the error", async () => {
        markAllNotificationsReadForUser.mockRejectedValue(new Error("db down"));

        const response = await POST();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error marking notifications as read:", expect.any(Error));
    });
});
