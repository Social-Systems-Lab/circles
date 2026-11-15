import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { afterAll, beforeEach, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const state = {
    role: "production",
    throwMonitoringFailure: false,
    monitoringFailureCalls: 0,
    databaseAvailable: true,
    alertFailure: false,
    alerts: [] as Array<{ to: string; templateAlias: string; templateModel: Record<string, unknown> }>,
    processCalls: 0,
    watchdogFailureWrite: null as Record<string, unknown> | null,
};

mock.module("node:fs", () => ({
    readFileSync: () => `${state.role}\n`,
}));
mock.module("@/lib/data/db", () => ({
    getDb: async () => {
        if (!state.databaseAvailable) throw new Error("synthetic database unavailable");
        return {
            collection: (name: string) => {
                if (name === "registrationRouting") {
                    return {
                        findOne: async () => ({
                            _id: "registration-routing",
                            mode: "pending",
                            deploymentId: "production-onboarding-20261115-route-test-01",
                            updatedAt: new Date("2026-11-15T12:00:00.000Z"),
                            updatedBy: "test",
                        }),
                    };
                }
                if (name === "onboardingWatchdogState") {
                    return {
                        findOne: async () => null,
                        replaceOne: async (_filter: unknown, document: Record<string, unknown>) => {
                            state.watchdogFailureWrite = document;
                            return { acknowledged: true };
                        },
                    };
                }
                throw new Error("unexpected collection");
            },
        };
    },
}));
mock.module("@/lib/data/email", () => ({
    sendEmail: async (options: { to: string; templateAlias: string; templateModel: Record<string, unknown> }) => {
        state.alerts.push(options);
        if (state.alertFailure) throw new Error("synthetic alert failure");
    },
}));
mock.module("@/lib/auth/pending-registration-monitoring", () => ({
    WATCHDOG_STATE_SCHEMA_VERSION: 1,
    WATCHDOG_STUCK_PROVISIONING_SECONDS: 600,
    getOperationsStatus: async () => {
        throw new Error("not used by the mocked processor");
    },
    runtimeSummaryFromEnvironment: () => ({ available: true }),
}));
mock.module("@/lib/auth/pending-registration-watchdog-control", () => ({
    pausePendingRegistrationForWatchdog: async () => "paused",
}));
mock.module("@/lib/auth/pending-registration-watchdog", () => ({
    processPendingRegistrationWatchdog: async () => {
        state.processCalls += 1;
        if (state.throwMonitoringFailure) throw new Error("synthetic monitoring failure");
        return {
            success: true,
            status: "healthy",
            reasons: [],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: null,
        };
    },
    processPendingRegistrationMonitoringFailure: async (dependencies: {
        sendAlert: (alert: {
            fingerprint: string;
            level: "monitoring_unavailable";
            reasons: string[];
            pauseResult: "not_requested";
        }) => Promise<void>;
    }) => {
        state.monitoringFailureCalls += 1;
        let alertDelivered = true;
        try {
            await dependencies.sendAlert({
                fingerprint: "monitoring_unavailable:monitoring_query_failed",
                level: "monitoring_unavailable",
                reasons: ["monitoring_query_failed"],
                pauseResult: "not_requested",
            });
        } catch {
            alertDelivered = false;
        }
        return {
            success: false,
            status: "monitoring_unavailable",
            reasons: ["monitoring_query_failed"],
            pauseResult: "not_requested",
            alertAttempted: true,
            alertDelivered,
        };
    },
}));

const mutableEnv = process.env as Record<string, string | undefined>;
const originalCronSecret = mutableEnv.CRON_SECRET;
const originalAlertEmail = mutableEnv.ONBOARDING_ALERT_EMAIL;
const originalDeploymentId = mutableEnv.REGISTRATION_DEPLOYMENT_ID;
mutableEnv.CRON_SECRET = "synthetic-cron-secret";
mutableEnv.ONBOARDING_ALERT_EMAIL = "operator@example.invalid";
mutableEnv.REGISTRATION_DEPLOYMENT_ID = "production-onboarding-20261115-route-test-01";

const { GET } = await import("./route");

beforeEach(() => {
    state.throwMonitoringFailure = false;
    state.monitoringFailureCalls = 0;
    state.role = "production";
    state.databaseAvailable = true;
    state.alertFailure = false;
    state.alerts = [];
    state.processCalls = 0;
    state.watchdogFailureWrite = null;
    mutableEnv.CRON_SECRET = "synthetic-cron-secret";
    mutableEnv.ONBOARDING_ALERT_EMAIL = "operator@example.invalid";
    mutableEnv.REGISTRATION_DEPLOYMENT_ID = "production-onboarding-20261115-route-test-01";
});

function request(authorization?: string) {
    return new NextRequest("https://kamooni.org/api/cron/onboarding-watchdog", {
        headers: authorization ? { authorization } : {},
    });
}

test("watchdog rejects missing or incorrect CRON_SECRET authentication", async () => {
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request("Bearer wrong-secret"))).status, 401);
    delete mutableEnv.CRON_SECRET;
    assert.equal((await GET(request("Bearer synthetic-cron-secret"))).status, 401);
    assert.equal(state.processCalls, 0);
});

test("authenticated staging/development watchdog invocation is a safe no-op", async () => {
    state.role = "staging";
    const response = await GET(request("Bearer synthetic-cron-secret"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "skipped");
    assert.equal(state.processCalls, 0);
});

test("authenticated healthy watchdog invocation returns 200", async () => {
    const response = await GET(request("Bearer synthetic-cron-secret"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        status: "healthy",
        reasons: [],
        pauseResult: "not_requested",
        alertAttempted: false,
        alertDelivered: null,
    });
});

test("monitoring failure returns 503 and sends only a sanitized fallback alert", async () => {
    state.throwMonitoringFailure = true;
    state.alertFailure = true;
    const response = await GET(request("Bearer synthetic-cron-secret"));
    assert.equal(response.status, 503);
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].to, "operator@example.invalid");
    assert.equal(state.alerts[0].templateAlias, "notification-reminder");
    const serialized = JSON.stringify(state.alerts[0].templateModel);
    assert.match(serialized, /monitoring_query_failed/);
    assert.match(serialized, /Automatic pause: not_requested/);
    assert.doesNotMatch(serialized, /synthetic-cron-secret|operator@example\.invalid/);
    assert.equal(state.monitoringFailureCalls, 1);
});

afterAll(() => {
    if (originalCronSecret === undefined) delete mutableEnv.CRON_SECRET;
    else mutableEnv.CRON_SECRET = originalCronSecret;
    if (originalAlertEmail === undefined) delete mutableEnv.ONBOARDING_ALERT_EMAIL;
    else mutableEnv.ONBOARDING_ALERT_EMAIL = originalAlertEmail;
    if (originalDeploymentId === undefined) delete mutableEnv.REGISTRATION_DEPLOYMENT_ID;
    else mutableEnv.REGISTRATION_DEPLOYMENT_ID = originalDeploymentId;
});
