import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
    computeNextRetryDelayMs,
    enqueuePushJobsForNotifications,
    isPushSuppressedByPauseConfig,
    processPendingPushJobs,
    type PushDispatcherStore,
    type PushRecipientRecord,
} from "./dispatcher";
import { buildGenericPushPayload, getPushCategoryForNotificationType, resolveNotificationRoutePath } from "./payload";
import type { PushDeliveryJobDoc, PushSubscriptionDoc } from "./types";

function createMemoryDispatcherStore({
    users = [],
    subscriptions = [],
    readNotificationIds = new Set<string>(),
    mutedPairs = new Set<string>(),
}: {
    users?: PushRecipientRecord[];
    subscriptions?: PushSubscriptionDoc[];
    readNotificationIds?: Set<string>;
    mutedPairs?: Set<string>;
}) {
    const userMap = new Map(users.map((u) => [u.did, u]));
    const subMap = new Map(subscriptions.map((s) => [String(s._id), { ...s }]));
    const jobs = new Map<string, PushDeliveryJobDoc>();
    let seq = 1;

    const store: PushDispatcherStore = {
        async findUsersByDids(dids) {
            return dids.map((did) => userMap.get(did)).filter((u): u is PushRecipientRecord => Boolean(u));
        },
        async findActiveSubscriptionsByUsers(dids) {
            const didSet = new Set(dids);
            return [...subMap.values()].filter((s) => didSet.has(s.userDid) && !s.revokedAt);
        },
        async findSubscriptionById(subscriptionId) {
            return subMap.get(String(subscriptionId)) ?? null;
        },
        async upsertDeliveryJob(job) {
            for (const existing of jobs.values()) {
                if (existing.deliveryKey === job.deliveryKey) {
                    return false;
                }
            }
            const id = crypto.createHash("md5").update(`job-${seq++}`).digest("hex").slice(0, 24);
            jobs.set(id, { ...job, _id: id });
            return true;
        },
        async claimNextDueJob(now, leaseUntil, processingToken) {
            const due = [...jobs.values()]
                .filter(
                    (job) =>
                        (job.status === "pending" && job.nextAttemptAt.getTime() <= now.getTime()) ||
                        (job.status === "processing" && job.leaseUntil && job.leaseUntil.getTime() <= now.getTime()),
                )
                .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime());

            const next = due[0];
            if (!next?._id) return null;

            const updated: PushDeliveryJobDoc = {
                ...next,
                status: "processing",
                attempts: next.attempts + 1,
                leaseUntil,
                processingToken,
                updatedAt: now,
            };
            jobs.set(String(next._id), updated);
            return { ...updated };
        },
        async finishJob(jobId, processingToken, update) {
            const existing = jobs.get(String(jobId));
            if (!existing || existing.status !== "processing" || existing.processingToken !== processingToken) {
                return false;
            }
            const next: PushDeliveryJobDoc = {
                ...existing,
                status: update.status,
                updatedAt: update.now,
                ...(update.nextAttemptAt !== undefined ? { nextAttemptAt: update.nextAttemptAt } : {}),
                ...(update.lastStatusCode !== undefined ? { lastStatusCode: update.lastStatusCode } : {}),
                ...(update.lastError !== undefined ? { lastError: update.lastError } : {}),
                ...(update.completedAt !== undefined ? { completedAt: update.completedAt } : {}),
            };
            delete next.leaseUntil;
            delete next.processingToken;
            jobs.set(String(jobId), next);
            return true;
        },
        async isNotificationRead(notificationId, userDid) {
            return readNotificationIds.has(`${userDid}:${notificationId}`);
        },
        async isConversationMuted(conversationId, userDid) {
            return mutedPairs.has(`${userDid}:${conversationId}`);
        },
        async revokeSubscriptionAndCancelJobs(subscriptionId, reason, now) {
            const sub = subMap.get(String(subscriptionId));
            if (sub && !sub.revokedAt) {
                subMap.set(String(subscriptionId), { ...sub, revokedAt: now, revokeReason: reason });
            }
            for (const [id, job] of jobs.entries()) {
                if (String(job.subscriptionId) === String(subscriptionId) && job.status === "pending") {
                    jobs.set(id, {
                        ...job,
                        status: "skipped",
                        lastError: reason,
                        updatedAt: now,
                        completedAt: now,
                    });
                }
            }
        },
    };

    return { store, jobs, subMap };
}

const enabledEnv = {
    WEB_PUSH_ENABLED: "true",
    WEB_PUSH_DISPATCH_ENABLED: "true",
    WEB_PUSH_VAPID_SUBJECT: "mailto:hello@socialsystems.io",
    WEB_PUSH_VAPID_PUBLIC_KEY: "BPubKey",
    WEB_PUSH_VAPID_PRIVATE_KEY: "PrivKey",
};

function makeSub(id: string, userDid: string): PushSubscriptionDoc {
    return {
        _id: id,
        userDid,
        endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
        endpointHash: crypto.createHash("sha256").update(id).digest("hex"),
        keys: {
            p256dh: Buffer.alloc(65, 1).toString("base64url"),
            auth: Buffer.alloc(16, 2).toString("base64url"),
        },
        createdAt: new Date("2026-11-27T10:00:00Z"),
        lastSeenAt: new Date("2026-11-27T10:00:00Z"),
    };
}

describe("Privacy-safe generic push payload and routing", () => {
    it("never leaks message contents, private Circle names, sender names, or item titles", () => {
        const sensitivePayload = buildGenericPushPayload({
            notificationId: "notif-1",
            type: "pm_received",
            content: {
                roomId: "room123",
                topicId: "topic456",
                user: { name: "Secret Sender", handle: "secretuser" },
                circle: { name: "Top Secret Circle", handle: "secret-circle" },
                messagePreview: "Meet at 5pm with the confidential key",
            },
        });

        const serialized = JSON.stringify(sensitivePayload);
        assert.equal(sensitivePayload.title, "Kamooni");
        assert.equal(sensitivePayload.body, "You have a new direct message.");
        assert.equal(sensitivePayload.url, "/chat/room123?topic=topic456");
        assert.equal(sensitivePayload.tag, "chat:room123");
        assert.equal(serialized.includes("Secret Sender"), false);
        assert.equal(serialized.includes("Top Secret Circle"), false);
        assert.equal(serialized.includes("confidential"), false);

        const secretInvite = buildGenericPushPayload({
            notificationId: "notif-2",
            type: "secret_circle_invitation",
            content: {
                url: "/secret-invitations/inv99",
                invitationId: "inv99",
                circle: { name: "Hidden Group" },
            },
        });
        assert.equal(secretInvite.body, "You have received a private Circle invitation.");
        assert.equal(secretInvite.url, "/secret-invitations/inv99");
        assert.equal(JSON.stringify(secretInvite).includes("Hidden Group"), false);
    });

    it("resolves safe domain routes and rejects unsafe URLs", () => {
        assert.equal(
            resolveNotificationRoutePath("event_status_changed", {
                circle: { handle: "music" },
                eventId: "ev1",
            }),
            "/circles/music/events/ev1",
        );
        assert.equal(
            resolveNotificationRoutePath("task_assigned", {
                circle: { handle: "garden" },
                taskId: "t7",
            }),
            "/circles/garden/tasks/t7",
        );
        assert.equal(
            resolveNotificationRoutePath("pm_received", {
                url: "https://evil.example/steal",
                roomId: "room1",
            }),
            "/",
        );
        assert.equal(getPushCategoryForNotificationType("event_invitation"), "events");
        assert.equal(getPushCategoryForNotificationType("task_shift_confirmed"), "tasks");
        assert.equal(getPushCategoryForNotificationType("pm_received"), "messages");
        assert.equal(getPushCategoryForNotificationType("user_verified"), "account");
        assert.equal(getPushCategoryForNotificationType("secret_circle_invitation"), "community");
    });

    it("checks notificationPauseConfig for global and category pauses", () => {
        const now = new Date("2026-11-27T12:00:00Z");
        assert.equal(
            isPushSuppressedByPauseConfig({ allUntil: new Date("2026-11-27T13:00:00Z") }, "messages", now),
            true,
        );
        assert.equal(
            isPushSuppressedByPauseConfig(
                { categoryUntil: { events: new Date("2026-11-27T13:00:00Z") } },
                "events",
                now,
            ),
            true,
        );
        assert.equal(
            isPushSuppressedByPauseConfig(
                { categoryUntil: { events: new Date("2026-11-27T11:00:00Z") } },
                "events",
                now,
            ),
            false,
        );
    });
});

describe("Durable push enqueue and dispatcher lifecycle", () => {
    it("respects feature flags, category toggles, pauses, and deduplicates by deliveryKey", async () => {
        const { store, jobs } = createMemoryDispatcherStore({
            users: [
                {
                    did: "did:alice",
                    handle: "alice",
                    accountStatus: "active",
                    pushPreferences: {
                        enabled: true,
                        categories: { messages: true, events: false, tasks: true, community: true, account: true },
                    },
                },
            ],
            subscriptions: [makeSub("sub-a1", "did:alice"), makeSub("sub-a2", "did:alice")],
        });

        const offRes = await enqueuePushJobsForNotifications(
            [{ _id: "n1", userId: "did:alice", type: "pm_received", content: { roomId: "r1" } }],
            { env: { ...enabledEnv, WEB_PUSH_DISPATCH_ENABLED: "false" }, store },
        );
        assert.deepEqual(offRes, { enqueued: 0, skipped: 1 });
        assert.equal(jobs.size, 0);

        const skippedCategory = await enqueuePushJobsForNotifications(
            [{ _id: "n2", userId: "did:alice", type: "event_invitation", content: { eventId: "e1" } }],
            { env: enabledEnv, store },
        );
        assert.deepEqual(skippedCategory, { enqueued: 0, skipped: 1 });

        const enqueuedRes = await enqueuePushJobsForNotifications(
            [
                { _id: "n1", userId: "did:alice", type: "pm_received", content: { roomId: "r1" } },
                { _id: "n1", userId: "did:alice", type: "pm_received", content: { roomId: "r1" } },
            ],
            { env: enabledEnv, store },
        );
        assert.equal(enqueuedRes.enqueued, 2);
        assert.equal(jobs.size, 2);
    });

    it("handles accepted, 410 permanent revoke, 429/5xx retry + terminal failure, and suppression checks", async () => {
        const nowMs = Date.parse("2026-11-27T12:00:00Z");
        let currentNow = new Date(nowMs);
        const readSet = new Set<string>(["did:alice:n-read"]);
        const mutedSet = new Set<string>(["did:alice:room-muted"]);

        const { store, jobs, subMap } = createMemoryDispatcherStore({
            users: [{ did: "did:alice", handle: "alice", accountStatus: "active" }],
            subscriptions: [makeSub("sub-ok", "did:alice"), makeSub("sub-gone", "did:alice")],
            readNotificationIds: readSet,
            mutedPairs: mutedSet,
        });

        await enqueuePushJobsForNotifications(
            [
                { _id: "n-ok", userId: "did:alice", type: "task_assigned", content: { taskId: "t1" } },
                { _id: "n-read", userId: "did:alice", type: "task_assigned", content: { taskId: "t2" } },
                { _id: "n-muted", userId: "did:alice", type: "pm_received", content: { roomId: "room-muted" } },
            ],
            { env: enabledEnv, store, now: () => currentNow },
        );

        let sentEndpoints: string[] = [];
        const stats1 = await processPendingPushJobs(50, {
            env: enabledEnv,
            store,
            now: () => currentNow,
            random: () => 0.5,
            sendPush: async (sub) => {
                sentEndpoints.push(sub.endpoint);
                if (sub.endpoint.endsWith("sub-gone")) {
                    return { outcome: "permanent_revoke", statusCode: 410, errorCode: "http_410" };
                }
                return { outcome: "accepted", statusCode: 201 };
            },
        });

        assert.equal(stats1.accepted, 1);
        assert.equal(stats1.revoked, 1);
        assert.ok(stats1.skipped >= 2);
        assert.ok(subMap.get("sub-gone")?.revokedAt instanceof Date);
        assert.equal(sentEndpoints.some((e) => e.endsWith("sub-ok")), true);

        // Retryable 429 -> requeues and honors Retry-After, then fails after max attempts.
        await enqueuePushJobsForNotifications(
            [{ _id: "n-retry", userId: "did:alice", type: "event_invitation", content: { eventId: "e9" } }],
            { env: enabledEnv, store, now: () => currentNow },
        );

        let retryCallCount = 0;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const s = await processPendingPushJobs(10, {
                env: enabledEnv,
                store,
                now: () => currentNow,
                random: () => 0.5,
                sendPush: async () => {
                    retryCallCount += 1;
                    return { outcome: "retryable", statusCode: 429, retryAfterSeconds: 60, errorCode: "http_429" };
                },
            });
            if (attempt < 5) {
                assert.equal(s.retried, 1);
                currentNow = new Date(currentNow.getTime() + 2 * 60 * 60 * 1000);
            } else {
                assert.equal(s.failed, 1);
            }
        }
        assert.equal(retryCallCount, 5);

        const retryDelay = computeNextRetryDelayMs(2, 120, () => 0.5);
        assert.equal(retryDelay, 120_000);
        assert.ok([...jobs.values()].some((j) => j.notificationId === "n-retry" && j.status === "failed"));
    });
});
