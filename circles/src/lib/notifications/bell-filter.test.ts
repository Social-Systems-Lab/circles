import assert from "node:assert/strict";
import { BELL_EXCLUDED_NOTIFICATION_TYPES } from "./bell-filter";

assert.deepEqual(
    BELL_EXCLUDED_NOTIFICATION_TYPES,
    ["pm_received"],
    "general bell notification filtering continues to exclude PM notifications",
);
assert.equal(
    BELL_EXCLUDED_NOTIFICATION_TYPES.includes("chat_mention"),
    false,
    "chat mentions remain visible in the bell notification list",
);

console.log("bell-filter tests passed");
