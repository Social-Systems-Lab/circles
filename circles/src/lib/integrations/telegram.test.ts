import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExternalNotificationChannel, Notification } from "@/models/models";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useStubbedFetch } from "@/test/hooks";
import { formatTelegramNotification, sendTelegramMessage } from "./telegram";

const restoreEnv = snapshotEnv("CIRCLES_URL", "TELEGRAM_BOT_TOKEN");
const consoleSpy = silenceConsole("warn", "error");

const notification = (content: Record<string, unknown> = {}, type = "pm_received") =>
    ({ type, userId: "did:recipient", content }) as unknown as Notification;
const channel = (privacyMode: string) => ({ privacyMode }) as unknown as ExternalNotificationChannel;

beforeEach(() => {
    setEnv("CIRCLES_URL", undefined);
});

afterEach(() => {
    restoreEnv();
});

describe("formatTelegramNotification", () => {
    test("only formats private message notifications", () => {
        for (const type of ["comment", "mention", "follow", ""]) {
            expect(formatTelegramNotification(notification({}, type), channel("full"))).toBeNull();
        }
    });

    describe("notify_only", () => {
        test("does not reveal who wrote or what was written", () => {
            const text = formatTelegramNotification(
                notification({ user: { name: "Secret Sender" }, messagePreview: "secret body", roomId: "r1" }),
                channel("notify_only"),
            );

            expect(text).toBe("You have a new Kamooni direct message.\n\nOpen Kamooni: https://kamooni.org/chat/r1");
            expect(text).not.toContain("Secret Sender");
            expect(text).not.toContain("secret body");
        });

        test("is the default for an unknown or missing privacy mode", () => {
            for (const mode of ["", "unknown", "FULL"]) {
                expect(formatTelegramNotification(notification({ messagePreview: "hidden" }), channel(mode))).toBe(
                    "You have a new Kamooni direct message.\n\nOpen Kamooni: https://kamooni.org",
                );
            }
            expect(formatTelegramNotification(notification(), {} as ExternalNotificationChannel)).toContain("You have a new");
        });
    });

    describe("snippet", () => {
        test("names the sender and shows the message preview", () => {
            expect(
                formatTelegramNotification(
                    notification({ user: { name: "Vee" }, messagePreview: "See you soon", roomId: "r1" }),
                    channel("snippet"),
                ),
            ).toBe("Vee sent you a direct message.\n\nSee you soon\n\nOpen Kamooni: https://kamooni.org/chat/r1");
        });

        test("omits the snippet when there is no body", () => {
            expect(formatTelegramNotification(notification({ user: { name: "Vee" } }), channel("snippet"))).toBe(
                "Vee sent you a direct message.\n\nOpen Kamooni: https://kamooni.org",
            );
        });

        test("truncates the body to 180 characters including the ellipsis", () => {
            const text = formatTelegramNotification(notification({ messagePreview: "x".repeat(500) }), channel("snippet"))!;
            const body = text.split("\n\n")[1];

            expect(body).toBe(`${"x".repeat(179)}...`);
            expect(body).toHaveLength(182);
        });

        test("keeps a body of exactly 180 characters intact", () => {
            const body = "y".repeat(180);

            expect(formatTelegramNotification(notification({ messagePreview: body }), channel("snippet"))).toContain(`\n\n${body}\n\n`);
        });
    });

    describe("full", () => {
        test("includes the whole message", () => {
            expect(
                formatTelegramNotification(
                    notification({ user: { name: "Vee" }, messagePreview: "Hello there", roomId: "r1" }),
                    channel("full"),
                ),
            ).toBe("Vee sent you a direct message:\n\nHello there\n\nOpen Kamooni: https://kamooni.org/chat/r1");
        });

        test("truncates the whole text to Telegram's limit with an ellipsis", () => {
            const text = formatTelegramNotification(notification({ messagePreview: "z".repeat(10_000) }), channel("full"))!;

            expect(text).toHaveLength(3800 + 2);
            expect(text.endsWith("...")).toBe(true);
        });
    });

    describe("message body and sender", () => {
        test.each([
            ["messagePreview", { messagePreview: "preview", body: "body", messageBody: "message body" }, "preview"],
            ["body", { body: "body", messageBody: "message body" }, "body"],
            ["messageBody", { messageBody: "message body" }, "message body"],
        ])("prefers %s", (_label, content, expected) => {
            expect(formatTelegramNotification(notification(content), channel("full"))).toContain(`\n\n${expected}\n\n`);
        });

        test("ignores a body that is not a string", () => {
            expect(formatTelegramNotification(notification({ messagePreview: { html: "x" } }), channel("full"))).toBe(
                "Someone sent you a direct message:\n\n\n\nOpen Kamooni: https://kamooni.org",
            );
        });

        test.each([
            ["the user", { user: { name: "Vee" }, author: { name: "Other" } }, "Vee"],
            ["the author", { author: { name: "Other" } }, "Other"],
            ["a generic name", {}, "Someone"],
        ])("names %s", (_label, content, name) => {
            expect(formatTelegramNotification(notification(content), channel("snippet"))).toStartWith(`${name} sent you`);
        });
    });

    describe("link", () => {
        test("points at the chat room, url-encoding its id", () => {
            expect(formatTelegramNotification(notification({ roomId: "room/1?x" }), channel("notify_only"))).toEndWith(
                "https://kamooni.org/chat/room%2F1%3Fx",
            );
        });

        test("points at the site root without a room id", () => {
            expect(formatTelegramNotification(notification({}), channel("notify_only"))).toEndWith("https://kamooni.org");
            expect(formatTelegramNotification(notification({ roomId: 5 }), channel("notify_only"))).toEndWith("https://kamooni.org");
        });

        test("uses CIRCLES_URL and trims trailing slashes", () => {
            setEnv("CIRCLES_URL", "https://circles.example///");

            expect(formatTelegramNotification(notification({ roomId: "r1" }), channel("notify_only"))).toEndWith(
                "https://circles.example/chat/r1",
            );
        });
    });
});

describe("sendTelegramMessage", () => {
    const fetchMock = useStubbedFetch();
    const respond = (response: { ok: boolean; text?: string }) =>
        fetchMock.mockResolvedValue(new Response(response.text ?? "", { status: response.ok ? 200 : 400 }));

    test("skips sending, with a warning, when no bot token is configured", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", undefined);
        respond({ ok: true });

        expect(await sendTelegramMessage("chat-1", "hello")).toBe(false);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleSpy.warn).toHaveBeenCalledWith("TELEGRAM_BOT_TOKEN is not configured; skipping Telegram notification.");
    });

    test("treats an empty token as not configured", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", "");
        respond({ ok: true });

        expect(await sendTelegramMessage("chat-1", "hello")).toBe(false);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("posts the message to the Telegram Bot API and returns true on success", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", "secret-token");
        respond({ ok: true });

        expect(await sendTelegramMessage("chat-1", "hello")).toBe(true);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.telegram.org/botsecret-token/sendMessage");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(init?.body as string)).toEqual({ chat_id: "chat-1", text: "hello", disable_web_page_preview: true });
    });

    test("returns false and logs the response when Telegram rejects the message", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", "secret-token");
        respond({ ok: false, text: "chat not found" });

        expect(await sendTelegramMessage("chat-1", "hello")).toBe(false);

        expect(consoleSpy.error).toHaveBeenCalledWith("Telegram sendMessage failed:", "chat not found");
    });

    test("propagates network failures to the caller", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", "secret-token");
        fetchMock.mockRejectedValue(new Error("network down"));

        await expect(sendTelegramMessage("chat-1", "hello")).rejects.toThrow("network down");
    });

    test("does not log the bot token", async () => {
        setEnv("TELEGRAM_BOT_TOKEN", "secret-token");
        respond({ ok: false, text: "nope" });

        await sendTelegramMessage("chat-1", "hello");

        expect(JSON.stringify(consoleSpy.error.mock.calls)).not.toContain("secret-token");
    });
});
