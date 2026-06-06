import crypto from "crypto";
import { timingSafeEqualString } from "./request-auth";

export const DONORBOX_SIGNATURE_TOLERANCE_MS = 60 * 1000;

export type DonorboxSignatureParts = {
    timestamp: string;
    signature: string;
};

export function parseDonorboxSignatureHeader(header: string | undefined | null): DonorboxSignatureParts | null {
    if (!header) {
        return null;
    }

    const parts = header.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }

    return {
        timestamp: parts[0],
        signature: parts[1],
    };
}

function getTimestampMs(timestamp: string): number | null {
    if (!/^\d+$/.test(timestamp)) {
        return null;
    }

    const parsed = Number(timestamp);
    if (!Number.isSafeInteger(parsed)) {
        return null;
    }

    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

export function verifyDonorboxSignature(params: {
    body: string;
    header: string | undefined | null;
    secret: string | undefined | null;
    nowMs?: number;
    toleranceMs?: number;
}): boolean {
    const { body, header, secret, nowMs = Date.now(), toleranceMs = DONORBOX_SIGNATURE_TOLERANCE_MS } = params;
    if (!secret) {
        return false;
    }

    const parsed = parseDonorboxSignatureHeader(header);
    if (!parsed || !/^[a-f0-9]{64}$/i.test(parsed.signature)) {
        return false;
    }

    const timestampMs = getTimestampMs(parsed.timestamp);
    if (timestampMs === null || Math.abs(nowMs - timestampMs) > toleranceMs) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${parsed.timestamp}.${body}`)
        .digest("hex");

    return timingSafeEqualString(parsed.signature.toLowerCase(), expectedSignature);
}
