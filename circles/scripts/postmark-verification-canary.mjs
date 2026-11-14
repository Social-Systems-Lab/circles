import crypto from "node:crypto";

export const POSTMARK_API_URL = "https://api.postmarkapp.com/email/withTemplate";
export const POSTMARK_VERIFICATION_TEMPLATE_ALIAS = "email-verification";
export const PRODUCTION_ORIGIN = "https://kamooni.org";

const SOCIAL_SYSTEMS_LAB_URL = "https://www.socialsystems.io/";
const RECIPIENT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PostmarkCanaryError extends Error {
    constructor(code) {
        super(code);
        this.name = "PostmarkCanaryError";
        this.code = code;
    }
}

function requiredValue(env, key) {
    const value = env[key]?.trim();
    if (!value || /[\r\n]/.test(value)) throw new PostmarkCanaryError(`missing_${key.toLowerCase()}`);
    return value;
}

export function validateCanaryRecipient(recipient) {
    const value = recipient.trim();
    if (!value || value.length > 254 || !RECIPIENT_PATTERN.test(value)) {
        throw new PostmarkCanaryError("invalid_recipient");
    }
    return value;
}

export function parseCanaryEnvironment(env) {
    if (env.EMAIL_TRANSPORT !== "postmark") throw new PostmarkCanaryError("email_transport_not_postmark");
    if (env.CIRCLES_URL !== PRODUCTION_ORIGIN) throw new PostmarkCanaryError("production_origin_mismatch");
    const token = requiredValue(env, "POSTMARK_API_TOKEN");
    const sender = requiredValue(env, "POSTMARK_SENDER_EMAIL");
    if (!RECIPIENT_PATTERN.test(sender)) throw new PostmarkCanaryError("invalid_sender");
    return { token, sender };
}

function buildVerificationActionUrl(verificationToken) {
    if (!verificationToken || verificationToken.length > 256 || /[\r\n]/.test(verificationToken)) {
        throw new PostmarkCanaryError("invalid_verification_token");
    }
    return `${PRODUCTION_ORIGIN}/signup/verify?token=${encodeURIComponent(verificationToken)}`;
}

export function buildPostmarkCanaryTemplateModel({ actionUrl, now = new Date() }) {
    return {
        product_url: PRODUCTION_ORIGIN,
        product_name: "Kamooni",
        company_name: "Social Systems Lab",
        company_url: SOCIAL_SYSTEMS_LAB_URL,
        company_address: "",
        email_signoff_html: `Thanks for being part of Kamooni!<br><br>The Kamooni Team at <a href="${SOCIAL_SYSTEMS_LAB_URL}">Social Systems Lab</a>`,
        email_signoff_text: `Thanks for being part of Kamooni!\n\nThe Kamooni Team at Social Systems Lab\n${SOCIAL_SYSTEMS_LAB_URL}`,
        name: "Kamooni Canary",
        actionUrl,
        action_url: actionUrl,
        support_email: "hello@socialsystems.io",
        current_year: now.getFullYear().toString(),
    };
}

export function buildPostmarkCanaryRequest({ recipient, sender, actionUrl, now = new Date() }) {
    const safeRecipient = validateCanaryRecipient(recipient);
    const safeSender = requiredValue({ sender }, "sender");
    const parsedActionUrl = new URL(actionUrl);
    if (
        parsedActionUrl.origin !== PRODUCTION_ORIGIN ||
        parsedActionUrl.pathname !== "/signup/verify" ||
        [...parsedActionUrl.searchParams.keys()].join(",") !== "token" ||
        !parsedActionUrl.searchParams.get("token") ||
        parsedActionUrl.username ||
        parsedActionUrl.password ||
        parsedActionUrl.hash
    ) {
        throw new PostmarkCanaryError("invalid_action_url");
    }
    return {
        From: safeSender,
        To: safeRecipient,
        TemplateAlias: POSTMARK_VERIFICATION_TEMPLATE_ALIAS,
        TemplateModel: buildPostmarkCanaryTemplateModel({ actionUrl, now }),
    };
}

export async function sendPostmarkVerificationCanary({
    recipient,
    sender,
    token,
    verificationToken,
    fetchImpl = globalThis.fetch,
    now = new Date(),
}) {
    const safeToken = requiredValue({ token }, "token");
    const requestBody = buildPostmarkCanaryRequest({
        recipient,
        sender,
        actionUrl: buildVerificationActionUrl(verificationToken),
        now,
    });

    let response;
    try {
        response = await fetchImpl(POSTMARK_API_URL, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": safeToken,
                "User-Agent": "Kamooni-Postmark-Canary/1.0",
            },
            body: JSON.stringify(requestBody),
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        throw new PostmarkCanaryError("postmark_request_failed");
    }

    let responseBody;
    try {
        responseBody = await response.json();
    } catch {
        throw new PostmarkCanaryError("postmark_invalid_response");
    }

    if (!response.ok) {
        throw new PostmarkCanaryError(`postmark_http_${Number.isInteger(response.status) ? response.status : "error"}`);
    }
    if (responseBody?.ErrorCode !== 0) {
        throw new PostmarkCanaryError("postmark_rejected_message");
    }
    if (typeof responseBody?.MessageID !== "string" || !responseBody.MessageID) {
        throw new PostmarkCanaryError("postmark_missing_message_id");
    }

    return {
        accepted: true,
        template: POSTMARK_VERIFICATION_TEMPLATE_ALIAS,
        messageIdPresent: true,
    };
}

async function readStdin(stream) {
    let value = "";
    for await (const chunk of stream) value += chunk;
    return value;
}

export async function runPostmarkVerificationCanary({
    env = process.env,
    stdin = process.stdin,
    fetchImpl = globalThis.fetch,
    now = new Date(),
} = {}) {
    const { token, sender } = parseCanaryEnvironment(env);
    const recipient = validateCanaryRecipient(await readStdin(stdin));
    const verificationToken = crypto.randomBytes(32).toString("base64url");
    return sendPostmarkVerificationCanary({
        recipient,
        sender,
        token,
        verificationToken,
        fetchImpl,
        now,
    });
}

export async function runCanaryCli() {
    try {
        const result = await runPostmarkVerificationCanary();
        console.log(JSON.stringify(result));
        return 0;
    } catch (error) {
        const code = error instanceof PostmarkCanaryError ? error.code : "canary_failed";
        console.error(`Postmark verification canary failed: ${code}`);
        process.exitCode = 1;
        return 1;
    }
}
