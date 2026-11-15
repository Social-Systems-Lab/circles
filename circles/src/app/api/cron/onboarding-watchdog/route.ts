import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { getDb } from "@/lib/data/db";
import { sendEmail } from "@/lib/data/email";
import {
    getOperationsStatus,
    runtimeSummaryFromEnvironment,
    type PendingRegistrationOperationsStatus,
} from "@/lib/auth/pending-registration-monitoring";
import { getRegistrationRouting, type RegistrationRoutingRecord } from "@/lib/auth/registration-routing";
import { EMPTY_WATCHDOG_STATE, type WatchdogState } from "@/lib/auth/pending-registration-watchdog-policy";
import {
    processPendingRegistrationMonitoringFailure,
    processPendingRegistrationWatchdog,
    type WatchdogPauseResult,
} from "@/lib/auth/pending-registration-watchdog";
import { pausePendingRegistrationForWatchdog } from "@/lib/auth/pending-registration-watchdog-control";

const WATCHDOG_STATE_ID = "onboarding-watchdog";
const EMERGENCY_ALERT_TIMEOUT_MS = 10_000;

function authorized(request: NextRequest): boolean {
    const expected = process.env.CRON_SECRET;
    const supplied = request.headers.get("authorization");
    return Boolean(expected && supplied === `Bearer ${expected}`);
}

function isProductionDeployment(): boolean {
    try {
        return readFileSync("/app/.kamooni-deployment-role", "utf8").trim() === "production";
    } catch {
        return false;
    }
}

function alertRecipient(): string | null {
    const value = process.env.ONBOARDING_ALERT_EMAIL?.trim();
    if (!value || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
    return value;
}

function safeReasons(reasons: string[]): string[] {
    return [...new Set(reasons.filter((reason) => /^[a-z0-9_]{1,64}$/.test(reason)))].sort();
}

async function sendOperatorAlert(
    recipient: string,
    level: string,
    reasons: string[],
    pauseResult: WatchdogPauseResult,
): Promise<void> {
    const safeStatus = safeReasons(reasons);
    const safePauseResult = safeReasons([pauseResult])[0] ?? "unknown";
    await sendEmail({
        to: recipient,
        templateAlias: "notification-reminder",
        templateModel: {
            name: "Kamooni onboarding operator",
            notifications: [
                `Onboarding watchdog status: ${level}`,
                `Signals: ${safeStatus.join(", ") || "none"}`,
                `Automatic pause: ${safePauseResult}`,
            ],
            actionUrl: process.env.CIRCLES_URL || "https://kamooni.org",
            productUrl: process.env.CIRCLES_URL || "https://kamooni.org",
            introText: "Kamooni onboarding requires operator review.",
            bodyText: "Review routing, pending-registration status and reconciliation state before resuming signup.",
            summaryText: `Onboarding watchdog: ${level}; pause: ${safePauseResult}.`,
            actionText: "Review Kamooni",
        },
    });
}

async function sendOperatorAlertWithTimeout(
    recipient: string,
    level: string,
    reasons: string[],
    pauseResult: WatchdogPauseResult,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            sendOperatorAlert(recipient, level, reasons, pauseResult),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("alert timeout")), EMERGENCY_ALERT_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function stateCollection() {
    return getDb().then((db) => db.collection<WatchdogState>("onboardingWatchdogState"));
}

function statusForWatchdog(): Promise<PendingRegistrationOperationsStatus> {
    const runtime = runtimeSummaryFromEnvironment(process.env, { running: true });
    return getDb().then((db) =>
        getOperationsStatus(db, {
            usersDirectory: process.env.ONBOARDING_USERS_DIR || "/circles/users",
            runtimeSummary: JSON.stringify(runtime),
        }),
    );
}

async function pauseForWatchdog(deploymentId: string): Promise<Exclude<WatchdogPauseResult, "not_requested">> {
    const collection = (await getDb()).collection<RegistrationRoutingRecord>("registrationRouting");
    return pausePendingRegistrationForWatchdog(collection, deploymentId);
}

async function notifyMonitoringFailure(recipient: string): Promise<boolean> {
    try {
        await sendOperatorAlertWithTimeout(
            recipient,
            "monitoring_unavailable",
            ["monitoring_query_failed"],
            "not_requested",
        );
        return true;
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isProductionDeployment()) {
        return NextResponse.json({
            success: true,
            status: "skipped",
            reasons: ["non_production_deployment"],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: null,
        });
    }

    const recipient = alertRecipient();
    const sendAlert = (alert: {
        fingerprint: string;
        level: "warning" | "critical" | "monitoring_unavailable";
        reasons: string[];
        pauseResult: WatchdogPauseResult;
    }) => {
        if (!recipient) throw new Error("alert recipient unavailable");
        return sendOperatorAlertWithTimeout(recipient, alert.level, alert.reasons, alert.pauseResult);
    };
    const getState = async () => {
        const collection = await stateCollection();
        return (await collection.findOne({ _id: WATCHDOG_STATE_ID })) ?? EMPTY_WATCHDOG_STATE;
    };
    const saveState = async (state: WatchdogState) => {
        const collection = await stateCollection();
        await collection.replaceOne({ _id: WATCHDOG_STATE_ID }, state, { upsert: true });
    };
    try {
        const result = await processPendingRegistrationWatchdog({
            getStatus: statusForWatchdog,
            getState,
            saveState,
            pausePendingRegistration: pauseForWatchdog,
            sendAlert,
            alertConfigured: Boolean(recipient),
            now: () => new Date(),
        });
        return NextResponse.json(result, { status: result.success ? 200 : 503 });
    } catch {
        console.error("Onboarding watchdog monitoring failed");
        try {
            const result = await processPendingRegistrationMonitoringFailure({
                getRouting: async () =>
                    getRegistrationRouting(
                        (await getDb()).collection<RegistrationRoutingRecord>("registrationRouting"),
                    ),
                deploymentId: process.env.REGISTRATION_DEPLOYMENT_ID || null,
                getState,
                saveState,
                pausePendingRegistration: pauseForWatchdog,
                sendAlert,
                alertConfigured: Boolean(recipient),
                now: () => new Date(),
            });
            return NextResponse.json(result, { status: 503 });
        } catch {
            const alertDelivered = recipient ? await notifyMonitoringFailure(recipient) : false;
            return NextResponse.json(
                {
                    success: false,
                    status: "monitoring_unavailable",
                    reasons: ["monitoring_query_failed", "watchdog_state_unavailable"],
                    alertDelivered,
                },
                { status: 503 },
            );
        }
    }
}
