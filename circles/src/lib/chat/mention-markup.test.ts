import assert from "node:assert/strict";
import { extractChatMentionIds } from "./mention-markup";

assert.deepEqual(extractChatMentionIds("[AnimaTim](/circles/animatim)"), ["animatim"]);
assert.deepEqual(extractChatMentionIds("hello AnimaTim"), []);
assert.deepEqual(extractChatMentionIds("[Anna S.](/circles/507f1f77bcf86cd799439011) hi"), [
    "507f1f77bcf86cd799439011",
]);
assert.deepEqual(extractChatMentionIds("[Encoded](/circles/anima%20tim)"), ["anima tim"]);
assert.deepEqual(extractChatMentionIds("[One](/circles/same) [Again](/circles/same)"), ["same"]);

console.log("mention-markup tests passed");
