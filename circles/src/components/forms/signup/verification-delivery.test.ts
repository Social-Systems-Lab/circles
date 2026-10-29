import assert from "node:assert/strict";
import { getSignupDeliveryNotice } from "./verification-delivery";

const failed = getSignupDeliveryNotice("failed", "Email sent.");
assert.equal(failed.deliveryFailed, true);
assert.doesNotMatch(failed.description, /sent/i, "failure copy must not claim delivery");
assert.match(failed.description, /retry/i, "failure copy provides a safe retry path");

const sent = getSignupDeliveryNotice("sent", "Email sent.");
assert.equal(sent.deliveryFailed, false);
assert.equal(sent.description, "Email sent.");

console.log("signup verification delivery copy tests passed");
