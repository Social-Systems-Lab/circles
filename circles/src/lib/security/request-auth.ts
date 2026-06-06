import crypto from "crypto";

export function timingSafeEqualString(a: string | undefined | null, b: string | undefined | null): boolean {
    if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
        return false;
    }

    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function hasValidBearerToken(authorizationHeader: string | undefined | null, expectedToken: string | undefined | null): boolean {
    if (!authorizationHeader || !expectedToken) {
        return false;
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return false;
    }

    return timingSafeEqualString(match[1], expectedToken);
}
