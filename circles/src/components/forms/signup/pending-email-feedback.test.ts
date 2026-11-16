import assert from "node:assert/strict";
// @ts-expect-error Bun provides test at runtime; Bun types are not installed.
import { test } from "bun:test";
import {
    PENDING_CORRECTION_DELIVERY_FAILED_MESSAGE,
    PENDING_CORRECTION_NOT_SAVED_MESSAGE,
    PENDING_RESEND_DELIVERY_FAILED_MESSAGE,
    pendingCorrectionMessage,
    pendingResendMessage,
} from "@/components/forms/signup/pending-email-feedback";

test("failed resend never claims that a verification email will arrive", () => {
    const message = pendingResendMessage(true);
    assert.equal(message, PENDING_RESEND_DELIVERY_FAILED_MESSAGE);
    assert.doesNotMatch(message, /will arrive|has been sent/i);
    assert.match(message, /couldn’t send/i);
});

test("successful resend preserves the privacy-safe delivery claim", () => {
    const message = pendingResendMessage(false);
    assert.match(message, /fresh verification link will arrive shortly/i);
});

test("failed correction distinguishes a saved address from failed delivery", () => {
    const message = pendingCorrectionMessage({ emailUpdated: true, deliveryFailed: true });
    assert.equal(message, PENDING_CORRECTION_DELIVERY_FAILED_MESSAGE);
    assert.match(message, /saved your corrected email/i);
    assert.match(message, /couldn’t send/i);
    assert.doesNotMatch(message, /will arrive|has been sent/i);
});

test("unapplied correction reports that the address was not saved", () => {
    const message = pendingCorrectionMessage({ emailUpdated: false, deliveryFailed: true });
    assert.equal(message, PENDING_CORRECTION_NOT_SAVED_MESSAGE);
    assert.doesNotMatch(message, /will arrive|saved your corrected email/i);
});

test("successful correction preserves the existing privacy-safe message", () => {
    const message = pendingCorrectionMessage({ emailUpdated: true, deliveryFailed: false });
    assert.match(message, /new verification link will arrive shortly/i);
});
