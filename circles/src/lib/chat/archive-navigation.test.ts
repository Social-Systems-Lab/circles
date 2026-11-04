import assert from "node:assert/strict";
import { getPostArchiveNavigationTarget } from "./archive-navigation";

const openConversationId = "0123456789abcdef01234567";
const otherConversationId = "89abcdef0123456701234567";

assert.equal(
    getPostArchiveNavigationTarget(`/chat/${openConversationId}`, openConversationId),
    "/chat/archived",
    "archiving the open DM navigates to the valid archived list",
);
assert.equal(
    getPostArchiveNavigationTarget(`/chat/${openConversationId}`, otherConversationId),
    null,
    "archiving another DM leaves the open conversation in place",
);
assert.equal(
    getPostArchiveNavigationTarget(`/chat/${openConversationId}`, openConversationId),
    "/chat/archived",
    "the same route decision applies to the mobile conversation list",
);
assert.equal(getPostArchiveNavigationTarget("/chat", openConversationId), null);
assert.equal(getPostArchiveNavigationTarget("/chat/archived", openConversationId), null);
assert.equal(getPostArchiveNavigationTarget(`/chat/archived/${openConversationId}`, openConversationId), null);

console.log("archive navigation tests passed");
