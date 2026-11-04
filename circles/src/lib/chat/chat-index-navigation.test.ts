import assert from "node:assert/strict";
import { getChatIndexAutoSelectionPath, getConversationListPath } from "./chat-index-navigation";

const rooms = [
    { _id: "first", unreadCount: 0 },
    { _id: "unread", unreadCount: 2 },
];

for (const isMobile of [true, null]) {
    assert.equal(
        getChatIndexAutoSelectionPath({
            isMobile,
            hasLoadedChatRooms: true,
            hasRedirected: false,
            hasExplicitSelection: false,
            chatRooms: rooms,
        }),
        null,
        "mobile and not-yet-resolved mobile state remain on the conversation list",
    );
}

assert.equal(
    getChatIndexAutoSelectionPath({
        isMobile: false,
        hasLoadedChatRooms: true,
        hasRedirected: false,
        hasExplicitSelection: false,
        chatRooms: rooms,
    }),
    "/chat/unread",
    "desktop keeps automatic unread-first conversation selection",
);
assert.equal(getConversationListPath(false), "/chat");
assert.equal(getConversationListPath(true), "/chat/archived");

console.log("chat index navigation tests passed");
