import { getEnabledTelegramChannelForUser } from "./external-notification-channels";
import { formatTelegramNotification, sendTelegramMessage } from "@/lib/integrations/telegram";
import type { Notification } from "@/models/models";

export const dispatchExternalNotifications = async (notifications: Notification[]): Promise<void> => {
    const pmNotifications = notifications.filter((notification) => notification.type === "pm_received");
    if (!pmNotifications.length) {
        return;
    }

    for (const notification of pmNotifications) {
        try {
            const channel = await getEnabledTelegramChannelForUser(notification.userId);

            if (!channel?.telegramChatId) {
                continue;
            }

            const text = formatTelegramNotification(notification, channel);
            if (!text) {
                continue;
            }

            await sendTelegramMessage(channel.telegramChatId, text);
        } catch (error) {
            console.error("Failed to dispatch external notification:", error);
        }
    }
};
