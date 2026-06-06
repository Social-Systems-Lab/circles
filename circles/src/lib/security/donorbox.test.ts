import { describe, expect, test } from "bun:test";
import crypto from "crypto";
import {
    DONORBOX_SIGNATURE_TOLERANCE_MS,
    parseDonorboxSignatureHeader,
    verifyDonorboxSignature,
} from "./donorbox";

const secret = "test-donorbox-secret";
const body = JSON.stringify([{ event_name: "donation.created" }]);
const timestamp = "1691135469";
const nowMs = Number(timestamp) * 1000;

function sign(inputTimestamp = timestamp, inputBody = body) {
    return crypto.createHmac("sha256", secret).update(`${inputTimestamp}.${inputBody}`).digest("hex");
}

describe("Donorbox webhook signature verification", () => {
    test("parses the documented comma-separated header", () => {
        expect(parseDonorboxSignatureHeader(`${timestamp},${sign()}`)).toEqual({
            timestamp,
            signature: sign(),
        });
    });

    test("accepts a valid timestamped HMAC signature", () => {
        expect(
            verifyDonorboxSignature({
                body,
                header: `${timestamp},${sign()}`,
                secret,
                nowMs,
            }),
        ).toBe(true);
    });

    test("rejects tampered bodies, bad signatures, and stale timestamps", () => {
        expect(
            verifyDonorboxSignature({
                body: JSON.stringify([{ event_name: "plan.updated" }]),
                header: `${timestamp},${sign()}`,
                secret,
                nowMs,
            }),
        ).toBe(false);

        expect(
            verifyDonorboxSignature({
                body,
                header: `${timestamp},${"a".repeat(64)}`,
                secret,
                nowMs,
            }),
        ).toBe(false);

        expect(
            verifyDonorboxSignature({
                body,
                header: `${timestamp},${sign()}`,
                secret,
                nowMs: nowMs + DONORBOX_SIGNATURE_TOLERANCE_MS + 1,
            }),
        ).toBe(false);
    });
});
