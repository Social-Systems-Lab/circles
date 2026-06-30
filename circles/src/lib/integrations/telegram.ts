import type { ExternalNotificationChannel, Notification } from "@/models/models";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_TELEGRAM_TEXT_LENGTH = 3800;

const truncate = (value: string, maxLength: number): string =>
    value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}...` : value;

const getNotificationBody = (notification: Notification): string => {
    const content = notification.content as any;
    const body = content?.messagePreview || content?.body || content?.messageBody;
    return typeof body === "string" ? body : "";
};

const getActorName = (notification: Notification): string => {
    const content = notification.content as any;
    return content?.user?.name || content?.author?.name || "Someone";
};

export const formatTelegramNotification = (
    notification: Notification,
    channel: ExternalNotificationChannel,
): string | null => {
    if (notification.type !== "pm_received") {
        return null;
    }

    const baseUrl = (process.env.CIRCLES_URL || "https://kamooni.org").replace(/\/+$/, "");
    const content = notification.content as any;
    const roomId = typeof content?.roomId === "string" ? content.roomId : undefined;
    const actionUrl = roomId ? `${baseUrl}/chat/${encodeURIComponent(roomId)}` : baseUrl;

    if (channel.privacyMode === "full") {
        const body = getNotificationBody(notification);
        return truncate(
            `${getActorName(notification)} sent you a direct message:\n\n${body}\n\nOpen Kamooni: ${actionUrl}`,
            MAX_TELEGRAM_TEXT_LENGTH,
        );
    }

    if (channel.privacyMode === "snippet") {
        const body = truncate(getNotificationBody(notification), 180);
        const suffix = body ? `\n\n${body}` : "";
        return truncate(
            `${getActorName(notification)} sent you a direct message.${suffix}\n\nOpen Kamooni: ${actionUrl}`,
            MAX_TELEGRAM_TEXT_LENGTH,
        );
    }

    return `You have a new Kamooni direct message.\n\nOpen Kamooni: ${actionUrl}`;
};

export const sendTelegramMessage = async (chatId: string, text: string): Promise<boolean> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn("TELEGRAM_BOT_TOKEN is not configured; skipping Telegram notification.");
        return false;
    }

    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
        }),
    });

    if (!response.ok) {
        console.error("Telegram sendMessage failed:", await response.text());
        return false;
    }

    return true;
};
