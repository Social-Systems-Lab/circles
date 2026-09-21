import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { createJsonRequest } from "@/test/next-request";

const connectTelegramChannelByToken = mock(async (_input: { token: string; telegramChatId: string; telegramUsername?: string }) => true);
mock.module("@/lib/data/external-notification-channels", () => ({ connectTelegramChannelByToken }));

const sendTelegramMessage = mock(async (_chatId: string, _text: string) => true);
mock.module("@/lib/integrations/telegram", () => ({ sendTelegramMessage }));

const { POST } = await import("./route");

const restoreEnv = snapshotEnv("TELEGRAM_WEBHOOK_SECRET");
const CONNECTED = "Telegram notifications are now connected to your Kamooni account.";
const INVALID = "This Kamooni Telegram connection link is invalid or expired.";

const update = (text: string | undefined, extra: Record<string, unknown> = {}) => ({
    message: { text, chat: { id: 12345 }, from: { username: "vee" }, ...extra },
});
const post = (body: unknown, options: { path?: string; headers?: Record<string, string> } = {}) =>
    POST(createJsonRequest(body, options));

beforeEach(() => {
    setEnv("TELEGRAM_WEBHOOK_SECRET", undefined);
    connectTelegramChannelByToken.mockReset();
    connectTelegramChannelByToken.mockResolvedValue(true);
    sendTelegramMessage.mockReset();
    sendTelegramMessage.mockResolvedValue(true);
});

afterEach(restoreEnv);

describe("POST /api/integrations/telegram/webhook", () => {
    describe("connecting a chat", () => {
        test("connects the channel that owns the /start token and confirms in the chat", async () => {
            const response = await post(update("/start abc123"));

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ ok: true });
            expect(connectTelegramChannelByToken).toHaveBeenCalledWith({ token: "abc123", telegramChatId: "12345", telegramUsername: "vee" });
            expect(sendTelegramMessage).toHaveBeenCalledWith("12345", CONNECTED);
        });

        test("tells the user when the link is invalid or expired", async () => {
            connectTelegramChannelByToken.mockResolvedValue(false);

            const response = await post(update("/start expired"));

            expect(await response.json()).toEqual({ ok: true });
            expect(sendTelegramMessage).toHaveBeenCalledWith("12345", INVALID);
        });

        test("accepts the command addressed to a specific bot", async () => {
            await post(update("/start@KamooniBot abc123"));

            expect(connectTelegramChannelByToken.mock.calls[0][0].token).toBe("abc123");
        });

        test("trims the message and the token", async () => {
            await post(update("   /start    abc123   "));

            expect(connectTelegramChannelByToken.mock.calls[0][0].token).toBe("abc123");
        });

        test("keeps everything after the command as the token", async () => {
            await post(update("/start abc 123"));

            expect(connectTelegramChannelByToken.mock.calls[0][0].token).toBe("abc 123");
        });

        test("sends the chat id as a string, including negative group ids", async () => {
            await post(update("/start abc", { chat: { id: -100123 } }));

            expect(connectTelegramChannelByToken.mock.calls[0][0].telegramChatId).toBe("-100123");
            expect(sendTelegramMessage.mock.calls[0][0]).toBe("-100123");
        });

        test("accepts a chat id of zero", async () => {
            await post(update("/start abc", { chat: { id: 0 } }));

            expect(connectTelegramChannelByToken).toHaveBeenCalledTimes(1);
            expect(connectTelegramChannelByToken.mock.calls[0][0].telegramChatId).toBe("0");
        });
    });

    describe("username", () => {
        test("prefers the sender's username", async () => {
            await post(update("/start abc", { from: { username: "sender" }, chat: { id: 1, username: "chat" } }));

            expect(connectTelegramChannelByToken.mock.calls[0][0].telegramUsername).toBe("sender");
        });

        test("falls back to the chat's username", async () => {
            await post(update("/start abc", { from: {}, chat: { id: 1, username: "chat" } }));

            expect(connectTelegramChannelByToken.mock.calls[0][0].telegramUsername).toBe("chat");
        });

        test("is left out when neither is a string", async () => {
            await post(update("/start abc", { from: { username: 5 }, chat: { id: 1, username: null } }));

            expect(connectTelegramChannelByToken.mock.calls[0][0].telegramUsername).toBeUndefined();
        });
    });

    describe("updates that are ignored", () => {
        test.each([
            ["a message without text", update(undefined)],
            ["a plain message", update("hello there")],
            ["/start without a token", update("/start")],
            ["/start with only spaces after it", update("/start   ")],
            ["another command", update("/help abc")],
            ["a command that only ends in start", update("/restart abc")],
            ["text that merely contains /start", update("please /start abc")],
            ["a message without a chat", { message: { text: "/start abc" } }],
            ["a message with a null chat id", update("/start abc", { chat: { id: null } })],
            ["an update without a message", { edited_message: { text: "/start abc" } }],
            ["an empty update", {}],
            ["a null update", null],
        ])("acknowledges %s without doing anything", async (_label, body) => {
            const response = await post(body);

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ ok: true });
            expect(connectTelegramChannelByToken).not.toHaveBeenCalled();
            expect(sendTelegramMessage).not.toHaveBeenCalled();
        });

        test("acknowledges a body that is not JSON", async () => {
            const response = await post("{broken");

            expect(response.status).toBe(200);
            expect(connectTelegramChannelByToken).not.toHaveBeenCalled();
        });
    });

    describe("webhook secret", () => {
        beforeEach(() => setEnv("TELEGRAM_WEBHOOK_SECRET", "s3cret"));

        test("rejects a request without the secret before reading the update", async () => {
            const response = await post(update("/start abc"));

            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ ok: false });
            expect(connectTelegramChannelByToken).not.toHaveBeenCalled();
        });

        test("rejects the wrong secret in either place", async () => {
            expect((await post(update("/start abc"), { headers: { "x-telegram-bot-api-secret-token": "wrong" } })).status).toBe(401);
            expect((await post(update("/start abc"), { path: "/?secret=wrong" })).status).toBe(401);
        });

        test("accepts the secret in Telegram's header", async () => {
            const response = await post(update("/start abc"), { headers: { "x-telegram-bot-api-secret-token": "s3cret" } });

            expect(response.status).toBe(200);
            expect(connectTelegramChannelByToken).toHaveBeenCalledTimes(1);
        });

        test("accepts the secret as a query parameter", async () => {
            const response = await post(update("/start abc"), { path: "/?secret=s3cret" });

            expect(response.status).toBe(200);
            expect(connectTelegramChannelByToken).toHaveBeenCalledTimes(1);
        });

        test("does not treat a secret that merely contains the configured one as valid", async () => {
            expect((await post(update("/start abc"), { headers: { "x-telegram-bot-api-secret-token": "s3cret-and-more" } })).status).toBe(401);
        });
    });

    test("accepts every request when no secret is configured", async () => {
        expect((await post(update("/start abc"))).status).toBe(200);
        expect(connectTelegramChannelByToken).toHaveBeenCalledTimes(1);
    });

    test("treats an empty secret as not configured", async () => {
        setEnv("TELEGRAM_WEBHOOK_SECRET", "");

        expect((await post(update("/start abc"))).status).toBe(200);
    });

    test("does not confirm the connection when storing it fails", async () => {
        connectTelegramChannelByToken.mockRejectedValue(new Error("db down"));

        await expect(post(update("/start abc"))).rejects.toThrow("db down");
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });
});
