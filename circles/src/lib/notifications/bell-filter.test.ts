import assert from "node:assert/strict";
import { BELL_EXCLUDED_NOTIFICATION_TYPES } from "./bell-filter";

assert.deepEqual(
    BELL_EXCLUDED_NOTIFICATION_TYPES,
    ["pm_received"],
    "general bell notification filtering continues to exclude PM notifications",
);

console.log("bell-filter tests passed");
