import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Notification } from "@/models/models";
import { silenceConsole } from "@/test/hooks";

const getEnabledTelegramChannelForUser = mock(async (_userId: string): Promise<Record<string, unknown> | null> => null);
mock.module("@/lib/data/external-notification-channels", () => ({ getEnabledTelegramChannelForUser }));

const formatTelegramNotification = mock((_notification: unknown, _channel: unknown): string | null => "formatted text");
const sendTelegramMessage = mock(async (_chatId: string, _text: string) => true);
mock.module("@/lib/integrations/telegram", () => ({ formatTelegramNotification, sendTelegramMessage }));

const { dispatchExternalNotifications } = await import("./external-notifications");

const notification = (overrides: Record<string, unknown> = {}) =>
    ({ type: "pm_received", userId: "did:recipient", content: {}, ...overrides }) as unknown as Notification;
const channel = { telegramChatId: "chat-1", privacyMode: "notify_only" };

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    getEnabledTelegramChannelForUser.mockReset();
    getEnabledTelegramChannelForUser.mockResolvedValue(channel);
    formatTelegramNotification.mockReset();
    formatTelegramNotification.mockReturnValue("formatted text");
    sendTelegramMessage.mockReset();
    sendTelegramMessage.mockResolvedValue(true);
});

describe("dispatchExternalNotifications", () => {
    test("sends the formatted message of a private message notification to the recipient's Telegram chat", async () => {
        const pm = notification();

        await dispatchExternalNotifications([pm]);

        expect(getEnabledTelegramChannelForUser).toHaveBeenCalledWith("did:recipient");
        expect(formatTelegramNotification).toHaveBeenCalledWith(pm, channel);
        expect(sendTelegramMessage).toHaveBeenCalledWith("chat-1", "formatted text");
    });

    test("does nothing for an empty list", async () => {
        await dispatchExternalNotifications([]);

        expect(getEnabledTelegramChannelForUser).not.toHaveBeenCalled();
    });

    test("ignores every notification type except private messages", async () => {
        await dispatchExternalNotifications([notification({ type: "comment" }), notification({ type: "mention" })]);

        expect(getEnabledTelegramChannelForUser).not.toHaveBeenCalled();
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    test("sends only the private messages from a mixed list", async () => {
        await dispatchExternalNotifications([
            notification({ type: "comment", userId: "did:a" }),
            notification({ userId: "did:b" }),
            notification({ type: "mention", userId: "did:c" }),
        ]);

        expect(getEnabledTelegramChannelForUser.mock.calls.map(([user]) => user)).toEqual(["did:b"]);
    });

    test("sends one message per private message notification, in order", async () => {
        getEnabledTelegramChannelForUser.mockImplementation(async (userId) => ({ telegramChatId: `chat-${userId}` }));

        await dispatchExternalNotifications([notification({ userId: "a" }), notification({ userId: "b" })]);

        expect(sendTelegramMessage.mock.calls.map(([chatId]) => chatId)).toEqual(["chat-a", "chat-b"]);
    });

    test("skips recipients without an enabled Telegram channel", async () => {
        getEnabledTelegramChannelForUser.mockResolvedValue(null);

        await dispatchExternalNotifications([notification()]);

        expect(formatTelegramNotification).not.toHaveBeenCalled();
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    test("skips channels that have no chat id", async () => {
        getEnabledTelegramChannelForUser.mockResolvedValue({ telegramChatId: "" });

        await dispatchExternalNotifications([notification()]);

        expect(formatTelegramNotification).not.toHaveBeenCalled();
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    test.each([null, ""])("skips a notification whose formatted text is %p", async (text) => {
        formatTelegramNotification.mockReturnValue(text);

        await dispatchExternalNotifications([notification()]);

        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    test("keeps delivering the rest when one delivery fails, and logs the failure", async () => {
        sendTelegramMessage.mockRejectedValueOnce(new Error("telegram down"));

        await dispatchExternalNotifications([notification({ userId: "a" }), notification({ userId: "b" })]);

        expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to dispatch external notification:", expect.any(Error));
    });

    test("keeps delivering the rest when a channel lookup fails", async () => {
        getEnabledTelegramChannelForUser.mockRejectedValueOnce(new Error("db down"));

        await dispatchExternalNotifications([notification({ userId: "a" }), notification({ userId: "b" })]);

        expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    });

    test("never rejects, whatever fails", async () => {
        getEnabledTelegramChannelForUser.mockRejectedValue(new Error("db down"));

        await expect(dispatchExternalNotifications([notification()])).resolves.toBeUndefined();
    });
});
