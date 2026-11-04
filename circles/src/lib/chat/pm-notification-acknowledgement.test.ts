import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { formatTelegramNotification } from "@/lib/integrations/telegram";

const chatRoomSource = readFileSync(new URL("../../components/modules/chat/chat-room.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../components/modules/chat/mongo-actions.ts", import.meta.url), "utf8");
const legacyEndpoint = new URL("../../app/api/notifications/mark-pms-as-read/route.ts", import.meta.url);

assert.equal(
    existsSync(legacyEndpoint),
    false,
    "the obsolete client-authorized PM acknowledgement endpoint is removed",
);

assert.doesNotMatch(
    chatRoomSource,
    /\/api\/notifications\/mark-pms-as-read/,
    "mounted rooms and background polling have no client-side PM acknowledgement request",
);
assert.doesNotMatch(
    chatRoomSource,
    /markLatestMessageAsRead/,
    "message-array updates cannot acknowledge PM notifications",
);
assert.match(
    actionSource,
    /await markTopicRead\([\s\S]*?await acknowledgeTopicPmNotifications\(/,
    "PM acknowledgement runs only after the topic read-state write succeeds",
);
assert.doesNotMatch(
    chatRoomSource,
    /unreadCount <= 0/,
    "a later deliberate interaction can retry notification acknowledgement after read state already advanced",
);
assert.match(
    formatTelegramNotification(
        {
            userId: "did:example:recipient",
            type: "pm_received",
            content: {
                roomId: "room-1",
                topicId: "64a000000000000000000001",
                messageId: "64a000000000000000000002",
                user: { name: "Sender" },
                messagePreview: "Hello",
            },
            isRead: false,
            createdAt: new Date(),
        },
        {
            userDid: "did:example:recipient",
            provider: "telegram",
            enabled: true,
            privacyMode: "full",
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ) || "",
    /^Sender sent you a direct message:\n\nHello\n\nOpen Kamooni: https?:\/\/[^/]+(?::\d+)?\/chat\/room-1$/,
    "topic and message metadata do not alter Telegram forwarding",
);

console.log("PM notification acknowledgement policy tests passed");
