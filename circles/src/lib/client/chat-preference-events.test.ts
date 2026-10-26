import assert from "node:assert/strict";
import {
    beginConversationMuteMutation,
    CONVERSATION_MUTE_PENDING_EVENT,
    createLatestPreferenceRequest,
    finishConversationMuteMutation,
    isConversationMuteMutationPending,
} from "./chat-preference-events";

(globalThis as any).window = new EventTarget();

const conversationId = "conversation-1";
const pendingEvents: boolean[] = [];
window.addEventListener(CONVERSATION_MUTE_PENDING_EVENT, (event) => {
    pendingEvents.push((event as CustomEvent<{ pending: boolean }>).detail.pending);
});

assert.equal(beginConversationMuteMutation(conversationId), true);
assert.equal(isConversationMuteMutationPending(conversationId), true);
assert.equal(beginConversationMuteMutation(conversationId), false, "overlapping mutations are rejected");
assert.deepEqual(pendingEvents, [true], "a rejected overlap does not emit a second pending event");

finishConversationMuteMutation(conversationId);
assert.equal(isConversationMuteMutationPending(conversationId), false);
assert.equal(beginConversationMuteMutation(conversationId), true, "a completed mutation can be retried safely");
finishConversationMuteMutation(conversationId);
assert.deepEqual(pendingEvents, [true, false, true, false]);

const requests = createLatestPreferenceRequest();
const firstRequest = requests.next();
const retryRequest = requests.next();
assert.equal(requests.isCurrent(firstRequest), false, "a retry rejects a stale response");
assert.equal(requests.isCurrent(retryRequest), true);
requests.invalidate();
assert.equal(requests.isCurrent(retryRequest), false, "switching conversations invalidates an in-flight response");

console.log("chat preference event tests passed");
