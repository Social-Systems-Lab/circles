export const WATCHDOG_ALERT_TEMPLATE_ALIAS = "notification-reminder";
export const WATCHDOG_ALERT_PRODUCTION_ORIGIN = "https://kamooni.org";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email/withTemplate";
const SOCIAL_SYSTEMS_LAB_URL = "https://www.socialsystems.io/";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_REASON_PATTERN = /^[a-z0-9_]{1,64}$/;
const SAFE_LEVELS = new Set(["warning", "critical", "monitoring_unavailable"]);
const SAFE_PAUSE_RESULTS = new Set(["not_requested", "paused", "already_paused", "not_pending", "failed"]);

export class WatchdogAlertCanaryError extends Error {
    constructor(code) {
        super(code);
        this.name = "WatchdogAlertCanaryError";
        this.code = SAFE_REASON_PATTERN.test(code) ? code : "canary_failed";
    }
}

function requiredLine(value, code) {
    if (typeof value !== "string" || !value || /[\r\n]/.test(value)) {
        throw new WatchdogAlertCanaryError(code);
    }
    return value;
}

function productionOrigin(value) {
    if (value !== WATCHDOG_ALERT_PRODUCTION_ORIGIN) {
        throw new WatchdogAlertCanaryError("production_origin_mismatch");
    }
    return value;
}

export function sanitizeWatchdogAlertReasons(reasons) {
    if (!Array.isArray(reasons)) return [];
    return [
        ...new Set(reasons.filter((reason) => typeof reason === "string" && SAFE_REASON_PATTERN.test(reason))),
    ].sort();
}

export function buildWatchdogAlertTemplateModel({
    level,
    reasons,
    pauseResult,
    origin = WATCHDOG_ALERT_PRODUCTION_ORIGIN,
    now = new Date(),
}) {
    const safeLevel = SAFE_LEVELS.has(level) ? level : "monitoring_unavailable";
    const safeReasons = sanitizeWatchdogAlertReasons(reasons);
    const safePauseResult = SAFE_PAUSE_RESULTS.has(pauseResult) ? pauseResult : "failed";
    const safeOrigin = productionOrigin(origin);
    const notifications = [
        `Onboarding watchdog status: ${safeLevel}`,
        `Signals: ${safeReasons.join(", ") || "none"}`,
        `Automatic pause: ${safePauseResult}`,
    ];
    const summaryText = `Onboarding watchdog: ${safeLevel}; pause: ${safePauseResult}.`;

    return {
        name: "Kamooni onboarding operator",
        notifications,
        actionUrl: safeOrigin,
        productUrl: safeOrigin,
        introText: "Kamooni onboarding requires operator review.",
        bodyText: "Review routing, pending-registration status and reconciliation state before resuming signup.",
        summaryText,
        actionText: "Review Kamooni",
        product_url: safeOrigin,
        product_name: "Kamooni",
        company_name: "Social Systems Lab",
        company_url: SOCIAL_SYSTEMS_LAB_URL,
        company_address: "",
        email_signoff_html: `Thanks for being part of Kamooni!<br><br>The Kamooni Team at <a href="${SOCIAL_SYSTEMS_LAB_URL}">Social Systems Lab</a>`,
        email_signoff_text: `Thanks for being part of Kamooni!\n\nThe Kamooni Team at Social Systems Lab\n${SOCIAL_SYSTEMS_LAB_URL}`,
        action_url: safeOrigin,
        action_text: "Review Kamooni",
        button_text: "Review Kamooni",
        intro_text: "Kamooni onboarding requires operator review.",
        body_text: "Review routing, pending-registration status and reconciliation state before resuming signup.",
        summary_text: summaryText,
        support_email: "hello@socialsystems.io",
        current_year: now.getFullYear().toString(),
    };
}

export function buildWatchdogAlertCanaryRequest({ origin, transport, token, sender, recipient, now = new Date() }) {
    const safeOrigin = productionOrigin(requiredLine(origin, "missing_production_origin"));
    if (transport !== "postmark") throw new WatchdogAlertCanaryError("email_transport_not_postmark");
    const safeToken = requiredLine(token, "missing_postmark_token");
    if (/\s/.test(safeToken)) throw new WatchdogAlertCanaryError("invalid_postmark_token");
    const safeSender = requiredLine(sender, "missing_postmark_sender");
    const safeRecipient = requiredLine(recipient, "missing_alert_recipient");
    if (!EMAIL_PATTERN.test(safeRecipient) || safeRecipient.length > 254) {
        throw new WatchdogAlertCanaryError("invalid_alert_recipient");
    }

    return {
        token: safeToken,
        body: {
            From: safeSender,
            To: safeRecipient,
            TemplateAlias: WATCHDOG_ALERT_TEMPLATE_ALIAS,
            TemplateModel: buildWatchdogAlertTemplateModel({
                level: "warning",
                reasons: ["watchdog_canary"],
                pauseResult: "not_requested",
                origin: safeOrigin,
                now,
            }),
        },
    };
}

export async function sendWatchdogAlertCanary({ request, fetchImpl = globalThis.fetch }) {
    let response;
    try {
        response = await fetchImpl(POSTMARK_API_URL, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": request.token,
                "User-Agent": "Kamooni-Watchdog-Alert-Canary/1.0",
            },
            body: JSON.stringify(request.body),
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        throw new WatchdogAlertCanaryError("postmark_request_failed");
    }

    let responseBody;
    try {
        responseBody = await response.json();
    } catch {
        throw new WatchdogAlertCanaryError("postmark_invalid_response");
    }
    if (!response.ok) {
        throw new WatchdogAlertCanaryError(
            `postmark_http_${Number.isInteger(response.status) ? response.status : "error"}`,
        );
    }
    if (responseBody?.ErrorCode !== 0) {
        throw new WatchdogAlertCanaryError("postmark_rejected_message");
    }
    if (typeof responseBody?.MessageID !== "string" || !responseBody.MessageID) {
        throw new WatchdogAlertCanaryError("postmark_missing_message_id");
    }

    return {
        accepted: true,
        template: WATCHDOG_ALERT_TEMPLATE_ALIAS,
        messageIdPresent: true,
    };
}

async function readInputLines(stream) {
    let value = "";
    for await (const chunk of stream) value += chunk;
    if (value.length > 4096) throw new WatchdogAlertCanaryError("input_too_large");
    const lines = value.endsWith("\n") ? value.slice(0, -1).split("\n") : value.split("\n");
    if (lines.length !== 5) throw new WatchdogAlertCanaryError("invalid_input_shape");
    return lines;
}

export async function runWatchdogAlertCanary({
    stdin = process.stdin,
    fetchImpl = globalThis.fetch,
    now = new Date(),
} = {}) {
    const [origin, transport, token, sender, recipient] = await readInputLines(stdin);
    return sendWatchdogAlertCanary({
        request: buildWatchdogAlertCanaryRequest({ origin, transport, token, sender, recipient, now }),
        fetchImpl,
    });
}

export async function runWatchdogAlertCanaryCli() {
    try {
        const result = await runWatchdogAlertCanary();
        console.log(JSON.stringify(result));
        return 0;
    } catch (error) {
        const code = error instanceof WatchdogAlertCanaryError ? error.code : "canary_failed";
        console.error(`Onboarding watchdog alert canary failed: ${code}`);
        process.exitCode = 1;
        return 1;
    }
}
