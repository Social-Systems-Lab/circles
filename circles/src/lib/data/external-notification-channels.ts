import crypto from "crypto";
import { ExternalNotificationChannels } from "./db";
import type { ExternalNotificationChannel, ExternalNotificationPrivacyMode } from "@/models/models";

const TELEGRAM_CONNECT_TOKEN_TTL_MS = 15 * 60 * 1000;

let indexesStarted = false;

const ensureExternalNotificationChannelIndexes = () => {
    if (indexesStarted || !ExternalNotificationChannels) return;
    indexesStarted = true;
    ExternalNotificationChannels.createIndex({ userDid: 1, provider: 1 }, { unique: true }).catch((error) => {
        console.error("Failed to create external notification channel user/provider index:", error);
    });
    ExternalNotificationChannels.createIndex({ provider: 1, connectTokenHash: 1 }).catch((error) => {
        console.error("Failed to create external notification channel connect token index:", error);
    });
};

export type TelegramChannelView = {
    enabled: boolean;
    privacyMode: ExternalNotificationPrivacyMode;
    connected: boolean;
    telegramUsername?: string;
    connectedAt?: string;
    disabledAt?: string;
};

export const telegramPrivacyModes: ExternalNotificationPrivacyMode[] = ["notify_only", "snippet", "full"];

export const isTelegramPrivacyMode = (value: unknown): value is ExternalNotificationPrivacyMode =>
    typeof value === "string" && telegramPrivacyModes.includes(value as ExternalNotificationPrivacyMode);

export const hashTelegramConnectToken = (token: string): string =>
    crypto.createHash("sha256").update(token).digest("hex");

export const getTelegramChannelForUser = async (userDid: string): Promise<ExternalNotificationChannel | null> => {
    ensureExternalNotificationChannelIndexes();
    return ExternalNotificationChannels.findOne({ userDid, provider: "telegram" });
};

export const getEnabledTelegramChannelForUser = async (
    userDid: string,
): Promise<ExternalNotificationChannel | null> => {
    ensureExternalNotificationChannelIndexes();
    return ExternalNotificationChannels.findOne({
        userDid,
        provider: "telegram",
        enabled: true,
        telegramChatId: { $exists: true, $type: "string", $ne: "" },
    });
};

export const getTelegramChannelViewForUser = async (userDid: string): Promise<TelegramChannelView> => {
    const channel = await getTelegramChannelForUser(userDid);
    return {
        enabled: channel?.enabled === true,
        privacyMode: channel?.privacyMode || "notify_only",
        connected: Boolean(channel?.telegramChatId && channel.enabled),
        telegramUsername: channel?.telegramUsername,
        connectedAt: channel?.connectedAt?.toISOString?.(),
        disabledAt: channel?.disabledAt?.toISOString?.(),
    };
};

export const createTelegramConnectToken = async (userDid: string): Promise<string> => {
    ensureExternalNotificationChannelIndexes();
    const token = crypto.randomBytes(32).toString("base64url");
    const now = new Date();

    await ExternalNotificationChannels.updateOne(
        { userDid, provider: "telegram" },
        {
            $set: {
                connectTokenHash: hashTelegramConnectToken(token),
                connectTokenExpiresAt: new Date(now.getTime() + TELEGRAM_CONNECT_TOKEN_TTL_MS),
                updatedAt: now,
            },
            $setOnInsert: {
                userDid,
                provider: "telegram",
                enabled: false,
                privacyMode: "notify_only",
                createdAt: now,
            },
        },
        { upsert: true },
    );

    return token;
};

export const connectTelegramChannelByToken = async ({
    token,
    telegramChatId,
    telegramUsername,
}: {
    token: string;
    telegramChatId: string;
    telegramUsername?: string;
}): Promise<boolean> => {
    ensureExternalNotificationChannelIndexes();
    const now = new Date();
    const result = await ExternalNotificationChannels.updateOne(
        {
            provider: "telegram",
            connectTokenHash: hashTelegramConnectToken(token),
            connectTokenExpiresAt: { $gt: now },
        },
        {
            $set: {
                enabled: true,
                telegramChatId,
                telegramUsername,
                connectedAt: now,
                updatedAt: now,
            },
            $unset: {
                connectTokenHash: "",
                connectTokenExpiresAt: "",
                disabledAt: "",
            },
        },
    );

    return result.modifiedCount > 0;
};

export const disconnectTelegramChannelForUser = async (userDid: string): Promise<void> => {
    ensureExternalNotificationChannelIndexes();
    const now = new Date();
    await ExternalNotificationChannels.updateOne(
        { userDid, provider: "telegram" },
        {
            $set: {
                enabled: false,
                disabledAt: now,
                updatedAt: now,
            },
            $unset: {
                telegramChatId: "",
                telegramUsername: "",
                connectTokenHash: "",
                connectTokenExpiresAt: "",
            },
        },
    );
};

export const updateTelegramChannelPrivacyMode = async (
    userDid: string,
    privacyMode: ExternalNotificationPrivacyMode,
): Promise<void> => {
    ensureExternalNotificationChannelIndexes();
    const now = new Date();
    await ExternalNotificationChannels.updateOne(
        { userDid, provider: "telegram" },
        {
            $set: {
                privacyMode,
                updatedAt: now,
            },
            $setOnInsert: {
                userDid,
                provider: "telegram",
                enabled: false,
                createdAt: now,
            },
        },
        { upsert: true },
    );
};
