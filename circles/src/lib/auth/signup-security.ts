import crypto from "crypto";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/data/db";

export const SIGNUP_IP_LIMIT = 5;
export const SIGNUP_EMAIL_LIMIT = 3;
export const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000;
export const SIGNUP_EMAIL_RESERVATION_MS = 5 * 60 * 1000;
export const SIGNUP_FORM_MIN_AGE_MS = 3_000;
export const SIGNUP_FORM_MAX_AGE_MS = 30 * 60 * 1000;

const GENERIC_REJECTION = "We couldn't complete your signup. Please check your details and try again later.";

export class SignupRejectedError extends Error {
    constructor() {
        super(GENERIC_REJECTION);
    }
}

export function normalizeEmailForComparison(value: string): string {
    const email = value.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 1) return email;
    let local = email.slice(0, at);
    let domain = email.slice(at + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
        local = local.split("+", 1)[0].replace(/\./g, "");
        domain = "gmail.com";
    }
    return `${local}@${domain}`;
}

function signingSecret(): string | null {
    return process.env.SIGNUP_FORM_HMAC_KEY || process.env.ALTCHA_HMAC_KEY || null;
}

export function issueSignupFormToken(now = Date.now()): string {
    const secret = signingSecret();
    if (!secret) throw new Error("Signup form signing is not configured");
    const body = Buffer.from(JSON.stringify({ issuedAt: now, nonce: crypto.randomBytes(16).toString("hex") })).toString(
        "base64url",
    );
    const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${signature}`;
}

export function verifySignupFormToken(token: string, now = Date.now()): boolean {
    const secret = signingSecret();
    const [body, suppliedSignature, extra] = token.split(".");
    if (!secret || !body || !suppliedSignature || extra) return false;
    const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest();
    let supplied: Buffer;
    try {
        supplied = Buffer.from(suppliedSignature, "base64url");
    } catch {
        return false;
    }
    if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature))
        return false;
    try {
        const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        const age = now - parsed.issuedAt;
        return Number.isFinite(parsed.issuedAt) && age >= SIGNUP_FORM_MIN_AGE_MS && age <= SIGNUP_FORM_MAX_AGE_MS;
    } catch {
        return false;
    }
}

type RateLimitRecord = { _id: string; count: number; expiresAt: Date };

export type SignupRateLimitCollection = Pick<
    Collection<RateLimitRecord>,
    "findOneAndUpdate" | "updateOne" | "createIndex"
>;

async function signupRateLimits(): Promise<SignupRateLimitCollection> {
    const collection = (await getDb()).collection<RateLimitRecord>("signupRateLimits");
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return collection;
}

async function consumeLimit(
    collection: SignupRateLimitCollection,
    key: string,
    maximum: number,
    now: Date,
): Promise<boolean> {
    try {
        const result = await collection.findOneAndUpdate(
            { _id: key, count: { $lt: maximum } },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + SIGNUP_RATE_WINDOW_MS) } },
            { upsert: true, returnDocument: "after" },
        );
        return Boolean(result && result.count <= maximum);
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false;
        throw error;
    }
}

async function restoreLimit(collection: SignupRateLimitCollection, key: string): Promise<void> {
    await collection.updateOne({ _id: key, count: { $gt: 0 } }, { $inc: { count: -1 } });
}

export async function consumeSignupRateLimits(
    ip: string,
    comparisonEmail: string,
    collection?: SignupRateLimitCollection,
    now = new Date(),
): Promise<boolean> {
    const records = collection ?? (await signupRateLimits());
    const window = Math.floor(now.getTime() / SIGNUP_RATE_WINDOW_MS);
    const ipKey = crypto.createHash("sha256").update(`ip:${window}:${ip}`).digest("hex");
    const emailKey = crypto.createHash("sha256").update(`email:${window}:${comparisonEmail}`).digest("hex");
    if (!(await consumeLimit(records, emailKey, SIGNUP_EMAIL_LIMIT, now))) return false;
    if (await consumeLimit(records, ipKey, SIGNUP_IP_LIMIT, now)) return true;
    await restoreLimit(records, emailKey);
    return false;
}

type SignupEmailReservationRecord = { _id: string; token: string; expiresAt: Date };

export type SignupEmailReservationCollection = Pick<
    Collection<SignupEmailReservationRecord>,
    "findOneAndUpdate" | "deleteOne" | "createIndex"
>;

async function signupEmailReservations(): Promise<SignupEmailReservationCollection> {
    const collection = (await getDb()).collection<SignupEmailReservationRecord>("signupEmailReservations");
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return collection;
}

export type SignupEmailReservation = { id: string; token: string };

export async function reserveSignupEmail(
    email: string,
    collection?: SignupEmailReservationCollection,
    now = new Date(),
): Promise<SignupEmailReservation | null> {
    const records = collection ?? (await signupEmailReservations());
    const id = crypto.createHash("sha256").update(normalizeEmailForComparison(email)).digest("hex");
    const token = crypto.randomBytes(16).toString("hex");
    try {
        const result = await records.findOneAndUpdate(
            { _id: id, expiresAt: { $lte: now } },
            { $set: { token, expiresAt: new Date(now.getTime() + SIGNUP_EMAIL_RESERVATION_MS) } },
            { upsert: true, returnDocument: "after" },
        );
        return result?.token === token ? { id, token } : null;
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return null;
        throw error;
    }
}

export async function releaseSignupEmailReservation(
    reservation: SignupEmailReservation,
    collection?: SignupEmailReservationCollection,
): Promise<void> {
    const records = collection ?? (await signupEmailReservations());
    await records.deleteOne({ _id: reservation.id, token: reservation.token });
}

export async function withSignupEmailReservation<T>(
    email: string,
    operation: () => Promise<T>,
    collection?: SignupEmailReservationCollection,
): Promise<T> {
    const reservation = await reserveSignupEmail(email, collection);
    if (!reservation) throw new SignupRejectedError();
    try {
        return await operation();
    } catch (error) {
        try {
            await releaseSignupEmailReservation(reservation, collection);
        } catch (releaseError) {
            console.error("Failed to release signup email reservation:", releaseError);
        }
        throw error;
    }
}

export type PilotSignupInput = {
    name: string;
    handle: string;
    _email: string;
    _password: string;
    altcha: string;
    website: string;
    formToken: string;
    onboardingFlow: "pilot-quick-signup";
};

const ALLOWED_KEYS = new Set<keyof PilotSignupInput>([
    "name",
    "handle",
    "_email",
    "_password",
    "altcha",
    "website",
    "formToken",
    "onboardingFlow",
]);

export function validatePilotSignupInput(values: Record<string, unknown>): PilotSignupInput {
    if (Object.keys(values).some((key) => !ALLOWED_KEYS.has(key as keyof PilotSignupInput)))
        throw new SignupRejectedError();
    const input = {
        name: typeof values.name === "string" ? values.name.trim() : "",
        handle: typeof values.handle === "string" ? values.handle.trim().toLowerCase() : "",
        _email: typeof values._email === "string" ? values._email.trim() : "",
        _password: typeof values._password === "string" ? values._password : "",
        altcha: typeof values.altcha === "string" ? values.altcha : "",
        website: typeof values.website === "string" ? values.website : "",
        formToken: typeof values.formToken === "string" ? values.formToken : "",
        onboardingFlow: values.onboardingFlow,
    };
    if (
        input.name.length < 2 ||
        input.name.length > 100 ||
        input.handle.length < 3 ||
        input.handle.length > 20 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.handle) ||
        input._email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input._email) ||
        input._password.length < 8 ||
        input._password.length > 128 ||
        input.onboardingFlow !== "pilot-quick-signup"
    ) {
        throw new SignupRejectedError();
    }
    return input as PilotSignupInput;
}

export async function guardPilotSignup(
    values: Record<string, unknown>,
    clientIp: string,
    dependencies: {
        verifyAltcha: (payload: string) => Promise<boolean>;
        consumeLimits: (ip: string, comparisonEmail: string) => Promise<boolean>;
        now?: number;
    },
): Promise<PilotSignupInput> {
    const input = validatePilotSignupInput(values);
    if (input.website || !verifySignupFormToken(input.formToken, dependencies.now)) throw new SignupRejectedError();
    if (!(await dependencies.verifyAltcha(input.altcha))) throw new SignupRejectedError();
    if (!(await dependencies.consumeLimits(clientIp, normalizeEmailForComparison(input._email)))) {
        throw new SignupRejectedError();
    }
    return input;
}
