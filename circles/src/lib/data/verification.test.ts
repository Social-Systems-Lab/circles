import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Circle, UserPrivate } from "@/models/models";
import { silenceConsole } from "@/test/hooks";

const sendNotifications = mock(async (..._args: unknown[]) => {});
mock.module("@/lib/data/notifications", () => ({ sendNotifications }));
mock.module("@/lib/data/user", () => ({ getUserPrivate: mock() }));
mock.module("@/lib/data/circle", () => ({ getCirclesByDids: mock() }));

const { sendVerificationRequestNotification } = await import("./verification");

const user = { name: "Vee Example", handle: "vee" } as Circle;
const admins = [{ did: "did:admin-1" }, { did: "did:admin-2" }] as UserPrivate[];

const consoleSpy = silenceConsole("log", "error");

beforeEach(() => {
    sendNotifications.mockReset();
    sendNotifications.mockResolvedValue(undefined);
});

describe("sendVerificationRequestNotification", () => {
    test("notifies every admin that the user requested verification", async () => {

        await sendVerificationRequestNotification(user, admins);

        expect(sendNotifications).toHaveBeenCalledWith("user_verification_request", admins, {
            user,
            messageBody: "User Vee Example (@vee) has requested account verification.",
            url: "/admin?tab=users",
        });
    });

    test("still calls the notifier when there are no admins", async () => {

        await sendVerificationRequestNotification(user, []);

        expect(sendNotifications).toHaveBeenCalledWith("user_verification_request", [], expect.any(Object));
    });

    test("never rejects when sending fails, and logs the error", async () => {
        sendNotifications.mockRejectedValue(new Error("notifier down"));

        await expect(sendVerificationRequestNotification(user, admins)).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith(
            "🔔 [NOTIFY] Error in sendVerificationRequestNotification:",
            expect.any(Error),
        );
    });
});
