import { beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const channels = await import("./external-notification-channels");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const MINUTE = 60 * 1000;
const createIndex = spyOn(db.ExternalNotificationChannels, "createIndex");

const seedChannel = (overrides: Record<string, unknown> = {}) => {
    db.ExternalNotificationChannels.docs.push({
        _id: new ObjectId(),
        userDid: "did:user",
        provider: "telegram",
        enabled: true,
        privacyMode: "notify_only",
        telegramChatId: "chat-1",
        ...overrides,
    });
};
const stored = (userDid = "did:user") => db.ExternalNotificationChannels.docs.find((doc) => doc.userDid === userDid)!;

beforeEach(() => {
    db.ExternalNotificationChannels.docs = [];
});

describe("isTelegramPrivacyMode / telegramPrivacyModes", () => {
    test("lists the supported modes from least to most revealing", () => {
        expect(channels.telegramPrivacyModes).toEqual(["notify_only", "snippet", "full"]);
    });

    test.each(["notify_only", "snippet", "full"])("accepts %s", (mode) => {
        expect(channels.isTelegramPrivacyMode(mode)).toBe(true);
    });

    test.each<[unknown]>([["FULL"], [""], ["everything"], [undefined], [null], [1], [{}], [["full"]]])(
        "rejects %p",
        (value) => {
            expect(channels.isTelegramPrivacyMode(value)).toBe(false);
        },
    );
});

describe("hashTelegramConnectToken", () => {
    test("is the hex sha256 of the token", () => {
        expect(channels.hashTelegramConnectToken("abc")).toBe(crypto.createHash("sha256").update("abc").digest("hex"));
        expect(channels.hashTelegramConnectToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    });

    test("is deterministic and differs for different tokens", () => {
        expect(channels.hashTelegramConnectToken("a")).toBe(channels.hashTelegramConnectToken("a"));
        expect(channels.hashTelegramConnectToken("a")).not.toBe(channels.hashTelegramConnectToken("b"));
    });
});

describe("index creation", () => {
    test("is started once, for the user/provider and connect token lookups", async () => {
        await channels.getTelegramChannelForUser("did:user");
        await channels.getTelegramChannelForUser("did:user");
        await channels.getEnabledTelegramChannelForUser("did:user");

        expect(createIndex).toHaveBeenCalledTimes(2);
        expect(createIndex.mock.calls[0]).toEqual([{ userDid: 1, provider: 1 }, { unique: true }]);
        expect(createIndex.mock.calls[1]).toEqual([{ provider: 1, connectTokenHash: 1 }]);
    });
});

describe("getTelegramChannelForUser", () => {
    test("returns the user's Telegram channel", async () => {
        seedChannel();

        expect(await channels.getTelegramChannelForUser("did:user")).toMatchObject({ telegramChatId: "chat-1" });
    });

    test("returns null without a channel", async () => {
        expect(await channels.getTelegramChannelForUser("did:user")).toBeNull();
    });

    test("ignores other users and other providers", async () => {
        seedChannel({ userDid: "did:other" });
        seedChannel({ provider: "email" });

        expect(await channels.getTelegramChannelForUser("did:user")).toBeNull();
    });

    test("returns a channel that is disabled", async () => {
        seedChannel({ enabled: false });

        expect(await channels.getTelegramChannelForUser("did:user")).not.toBeNull();
    });
});

describe("getEnabledTelegramChannelForUser", () => {
    test("returns an enabled channel with a chat id", async () => {
        seedChannel();

        expect(await channels.getEnabledTelegramChannelForUser("did:user")).toMatchObject({ telegramChatId: "chat-1" });
    });

    test.each([
        ["disabled", { enabled: false }],
        ["without a chat id", { telegramChatId: undefined }],
        ["with an empty chat id", { telegramChatId: "" }],
        ["with a non-string chat id", { telegramChatId: 12345 }],
    ])("does not return a channel that is %s", async (_label, overrides) => {
        seedChannel(overrides);
        if ("telegramChatId" in overrides && overrides.telegramChatId === undefined) delete stored().telegramChatId;

        expect(await channels.getEnabledTelegramChannelForUser("did:user")).toBeNull();
    });
});

describe("getTelegramChannelViewForUser", () => {
    test("describes a connected channel with ISO timestamps", async () => {
        const connectedAt = new Date("2026-06-01T10:00:00.000Z");
        seedChannel({ privacyMode: "snippet", telegramUsername: "vee", connectedAt });

        expect(await channels.getTelegramChannelViewForUser("did:user")).toEqual({
            enabled: true,
            privacyMode: "snippet",
            connected: true,
            telegramUsername: "vee",
            connectedAt: "2026-06-01T10:00:00.000Z",
            disabledAt: undefined,
        });
    });

    test("describes a missing channel as disabled with the most private mode", async () => {
        expect(await channels.getTelegramChannelViewForUser("did:user")).toEqual({
            enabled: false,
            privacyMode: "notify_only",
            connected: false,
            telegramUsername: undefined,
            connectedAt: undefined,
            disabledAt: undefined,
        });
    });

    test("is not connected when disabled, even if a chat id remains", async () => {
        seedChannel({ enabled: false, disabledAt: new Date("2026-06-02T10:00:00.000Z") });

        const view = await channels.getTelegramChannelViewForUser("did:user");

        expect(view).toMatchObject({ enabled: false, connected: false, disabledAt: "2026-06-02T10:00:00.000Z" });
    });

    test("is not connected without a chat id", async () => {
        seedChannel({ telegramChatId: undefined });

        expect((await channels.getTelegramChannelViewForUser("did:user")).connected).toBe(false);
    });

    test("only treats enabled === true as enabled", async () => {
        seedChannel({ enabled: "yes" });

        expect((await channels.getTelegramChannelViewForUser("did:user")).enabled).toBe(false);
    });

    test("never exposes the chat id or connect token", async () => {
        seedChannel({ connectTokenHash: "hash" });

        const view = await channels.getTelegramChannelViewForUser("did:user");

        expect(JSON.stringify(view)).not.toContain("chat-1");
        expect(JSON.stringify(view)).not.toContain("hash");
    });
});

describe("createTelegramConnectToken", () => {
    test("returns a url-safe token and stores only its hash with a 15 minute expiry", async () => {
        const token = await channels.createTelegramConnectToken("did:user");

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(stored()).toMatchObject({
            connectTokenHash: channels.hashTelegramConnectToken(token),
            connectTokenExpiresAt: new Date(NOW.getTime() + 15 * MINUTE),
            updatedAt: NOW,
        });
        expect(JSON.stringify(stored())).not.toContain(token);
    });

    test("creates a disabled channel with the most private mode for a new user", async () => {
        await channels.createTelegramConnectToken("did:user");

        expect(stored()).toMatchObject({
            userDid: "did:user",
            provider: "telegram",
            enabled: false,
            privacyMode: "notify_only",
            createdAt: NOW,
        });
    });

    test("keeps the settings of an existing channel and replaces the previous token", async () => {
        seedChannel({ privacyMode: "full", connectTokenHash: "old-hash" });

        const token = await channels.createTelegramConnectToken("did:user");

        expect(db.ExternalNotificationChannels.docs).toHaveLength(1);
        expect(stored()).toMatchObject({
            privacyMode: "full",
            enabled: true,
            telegramChatId: "chat-1",
            connectTokenHash: channels.hashTelegramConnectToken(token),
        });
    });

    test("issues a different token every time", async () => {
        expect(await channels.createTelegramConnectToken("did:user")).not.toBe(await channels.createTelegramConnectToken("did:user"));
    });
});

describe("connectTelegramChannelByToken", () => {
    const connect = (token: string, extra: Record<string, unknown> = {}) =>
        channels.connectTelegramChannelByToken({ token, telegramChatId: "chat-9", telegramUsername: "vee", ...extra });

    test("connects the channel that owns the token, enabling it and consuming the token", async () => {
        const token = await channels.createTelegramConnectToken("did:user");

        expect(await connect(token)).toBe(true);

        expect(stored()).toMatchObject({
            enabled: true,
            telegramChatId: "chat-9",
            telegramUsername: "vee",
            connectedAt: NOW,
        });
        expect(stored().connectTokenHash).toBeUndefined();
        expect(stored().connectTokenExpiresAt).toBeUndefined();
    });

    test("clears an earlier disconnection", async () => {
        const token = await channels.createTelegramConnectToken("did:user");
        stored().disabledAt = new Date(0);

        await connect(token);

        expect(stored().disabledAt).toBeUndefined();
    });

    test("a token can only be used once", async () => {
        const token = await channels.createTelegramConnectToken("did:user");

        expect(await connect(token)).toBe(true);
        expect(await connect(token, { telegramChatId: "attacker-chat" })).toBe(false);
        expect(stored().telegramChatId).toBe("chat-9");
    });

    test("rejects an unknown token", async () => {
        await channels.createTelegramConnectToken("did:user");

        expect(await connect("not-the-token")).toBe(false);
        expect(stored().enabled).toBe(false);
    });

    test("rejects the stored hash presented as if it were the token", async () => {
        const token = await channels.createTelegramConnectToken("did:user");

        expect(await connect(channels.hashTelegramConnectToken(token))).toBe(false);
    });

    test("rejects an expired token", async () => {
        const token = await channels.createTelegramConnectToken("did:user");
        setSystemTime(new Date(NOW.getTime() + 15 * MINUTE + 1));

        expect(await connect(token)).toBe(false);
        expect(stored().enabled).toBe(false);
    });

    test("rejects a token at the exact moment of expiry", async () => {
        const token = await channels.createTelegramConnectToken("did:user");
        setSystemTime(new Date(NOW.getTime() + 15 * MINUTE));

        expect(await connect(token)).toBe(false);
    });

    test("accepts a token until just before it expires", async () => {
        const token = await channels.createTelegramConnectToken("did:user");
        setSystemTime(new Date(NOW.getTime() + 15 * MINUTE - 1));

        expect(await connect(token)).toBe(true);
    });

    test("only connects the channel of the matching token", async () => {
        const first = await channels.createTelegramConnectToken("did:first");
        await channels.createTelegramConnectToken("did:second");

        await connect(first);

        expect(stored("did:first").enabled).toBe(true);
        expect(stored("did:second").enabled).toBe(false);
    });

    test("only matches Telegram channels", async () => {
        const token = "shared-token";
        seedChannel({ provider: "email", connectTokenHash: channels.hashTelegramConnectToken(token), connectTokenExpiresAt: new Date(NOW.getTime() + MINUTE) });

        expect(await connect(token)).toBe(false);
    });
});

describe("disconnectTelegramChannelForUser", () => {
    test("disables the channel and forgets the chat and pending token", async () => {
        seedChannel({ telegramUsername: "vee", connectTokenHash: "hash", connectTokenExpiresAt: NOW });

        await channels.disconnectTelegramChannelForUser("did:user");

        expect(stored()).toMatchObject({ enabled: false, disabledAt: NOW, updatedAt: NOW });
        for (const field of ["telegramChatId", "telegramUsername", "connectTokenHash", "connectTokenExpiresAt"]) {
            expect(stored()[field]).toBeUndefined();
        }
    });

    test("keeps the privacy mode", async () => {
        seedChannel({ privacyMode: "full" });

        await channels.disconnectTelegramChannelForUser("did:user");

        expect(stored().privacyMode).toBe("full");
    });

    test("does not create a channel for a user without one", async () => {
        await channels.disconnectTelegramChannelForUser("did:user");

        expect(db.ExternalNotificationChannels.docs).toHaveLength(0);
    });

    test("only affects the given user", async () => {
        seedChannel();
        seedChannel({ userDid: "did:other" });

        await channels.disconnectTelegramChannelForUser("did:user");

        expect(stored("did:other").enabled).toBe(true);
    });
});

describe("updateTelegramChannelPrivacyMode", () => {
    test("changes the privacy mode of an existing channel and keeps it connected", async () => {
        seedChannel();

        await channels.updateTelegramChannelPrivacyMode("did:user", "full");

        expect(stored()).toMatchObject({ privacyMode: "full", enabled: true, telegramChatId: "chat-1", updatedAt: NOW });
    });

    test("creates a disabled channel carrying the chosen mode when none exists", async () => {
        await channels.updateTelegramChannelPrivacyMode("did:user", "snippet");

        expect(stored()).toMatchObject({
            userDid: "did:user",
            provider: "telegram",
            enabled: false,
            privacyMode: "snippet",
            createdAt: NOW,
        });
    });

    test("does not reset createdAt of an existing channel", async () => {
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        seedChannel({ createdAt });

        await channels.updateTelegramChannelPrivacyMode("did:user", "snippet");

        expect(stored().createdAt).toEqual(createdAt);
    });
});
