import assert from "node:assert/strict";
import { buildConversationUpdatedAtCompareAndSetFilter } from "./topic-mutations";

const conversationObjectId = { opaqueId: "conversation-1" };
const observedUpdatedAt = new Date("2026-08-08T11:00:00.000Z");
const concurrentUpdatedAt = new Date("2026-08-08T11:00:01.000Z");

const recalculationFilter = buildConversationUpdatedAtCompareAndSetFilter(conversationObjectId, observedUpdatedAt);

assert.deepEqual(recalculationFilter, {
    _id: conversationObjectId,
    updatedAt: observedUpdatedAt,
});
assert.notDeepEqual(
    recalculationFilter,
    { _id: conversationObjectId, updatedAt: concurrentUpdatedAt },
    "a conversation changed by concurrent activity no longer matches the recalculation filter",
);
assert.deepEqual(buildConversationUpdatedAtCompareAndSetFilter(conversationObjectId), {
    _id: conversationObjectId,
    updatedAt: { $exists: false },
});

console.log("mongo topic updatedAt compare-and-set tests passed");
