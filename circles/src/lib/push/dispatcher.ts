import crypto from "node:crypto";
import { isWebPushDispatchEnabled, type PushEnv } from "./config";
import { buildGenericPushPayload, getPushCategoryForNotificationType } from "./payload";
import { normalizePushPreferences } from "./preferences";
import type {
    PushDeliveryJobDoc,
    PushDeliveryJobStatus,
    PushNotificationCategoryKey,
    PushNotificationPayload,
    PushSubscriptionDoc,
} from "./types";
import type { WebPushSendOutcome } from "./web-push-adapter";

export const PUSH_JOB_LEASE_MS = 60_000;
export const PUSH_JOB_MAX_ATTEMPTS = 5;
export const PUSH_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 3_600_000;

export type PushRecipientRecord = {
    did: string;
    handle?: string;
    accountStatus?: string;
    pushPreferences?: unknown;
    notificationPauseConfig?: {
        allUntil?: Date | string;
        categoryUntil?: Record<string, Date | string>;
    };
};

export type PushDispatcherNotificationInput = {
    _id?: unknown;
    userId: string;
    type: string;
    content?: Record<string, unknown>;
    createdAt?: Date;
};

export type PushDispatcherStore = {
    ensureIndexes?: () => Promise<void>;
    findUsersByDids: (dids: string[]) => Promise<PushRecipientRecord[]>;
    findActiveSubscriptionsByUsers: (dids: string[]) => Promise<PushSubscriptionDoc[]>;
    findSubscriptionById: (subscriptionId: PushSubscriptionDoc["_id"]) => Promise<PushSubscriptionDoc | null>;
    upsertDeliveryJob: (job: Omit<PushDeliveryJobDoc, "_id">) => Promise<boolean>;
    claimNextDueJob: (now: Date, leaseUntil: Date, processingToken: string) => Promise<PushDeliveryJobDoc | null>;
    finishJob: (
        jobId: PushDeliveryJobDoc["_id"],
        processingToken: string,
        update: {
            status: PushDeliveryJobStatus;
            nextAttemptAt?: Date;
            lastStatusCode?: number;
            lastError?: string;
            completedAt?: Date;
            now: Date;
        },
    ) => Promise<boolean>;
    isNotificationRead: (notificationId: string, userDid: string) => Promise<boolean>;
    isConversationMuted: (conversationId: string, userDid: string) => Promise<boolean>;
    revokeSubscriptionAndCancelJobs: (
        subscriptionId: PushSubscriptionDoc["_id"],
        reason: string,
        now: Date,
    ) => Promise<void>;
};

export type PushDispatcherDeps = {
    env?: PushEnv;
    now?: () => Date;
    random?: () => number;
    store?: PushDispatcherStore;
    sendPush?: (
        subscription: { endpoint: string; keys: PushSubscriptionDoc["keys"] },
        payload: PushNotificationPayload,
        options?: { ttlSeconds?: number; env?: PushEnv },
    ) => Promise<WebPushSendOutcome>;
};

export type PushEnqueueStats = {
    enqueued: number;
    skipped: number;
};

export type PushDispatchStats = {
    claimed: number;
    accepted: number;
    retried: number;
    revoked: number;
    skipped: number;
    expired: number;
    failed: number;
};

const PAUSE_CATEGORY_ALIASES: Record<PushNotificationCategoryKey, string[]> = {
    messages: ["messages", "chat", "pm"],
    events: ["events"],
    tasks: ["tasks"],
    community: ["community", "feed", "proposals", "issues", "goals"],
    account: ["account"],
};

function parseOptionalDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

export function isPushSuppressedByPauseConfig(
    pauseConfig: PushRecipientRecord["notificationPauseConfig"],
    category: PushNotificationCategoryKey,
    now: Date,
): boolean {
    if (!pauseConfig) {
        return false;
    }

    const allUntil = parseOptionalDate(pauseConfig.allUntil);
    if (allUntil && allUntil.getTime() > now.getTime()) {
        return true;
    }

    if (pauseConfig.categoryUntil) {
        for (const key of PAUSE_CATEGORY_ALIASES[category]) {
            const until = parseOptionalDate(pauseConfig.categoryUntil[key]);
            if (until && until.getTime() > now.getTime()) {
                return true;
            }
        }
    }

    return false;
}

export function isRecipientEligibleForPush(
    user: PushRecipientRecord | undefined,
    type: string,
    now: Date,
): boolean {
    if (!user) {
        return false;
    }
    if (user.accountStatus === "rejected" || user.accountStatus === "pending_verification") {
        return false;
    }

    const prefs = normalizePushPreferences(user.pushPreferences);
    if (!prefs.enabled) {
        return false;
    }

    const category = getPushCategoryForNotificationType(type);
    if (!prefs.categories[category]) {
        return false;
    }

    return !isPushSuppressedByPauseConfig(user.notificationPauseConfig, category, now);
}

export function computeNextRetryDelayMs(
    attempts: number,
    retryAfterSeconds?: number,
    randomFn: () => number = Math.random,
): number {
    const exp = Math.max(0, attempts - 1);
    const baseDelay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, exp), MAX_RETRY_DELAY_MS);
    const jitterFactor = 0.8 + randomFn() * 0.4;
    const jittered = Math.round(baseDelay * jitterFactor);
    const retryAfterMs =
        typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
            ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS)
            : 0;
    return Math.max(jittered, retryAfterMs);
}

async function createMongoDispatcherStore(): Promise<PushDispatcherStore> {
    const [
        { ObjectId },
        {
            ChatConversationPreferences,
            Circles,
            Notifications,
            PushDeliveryJobs,
            PushSubscriptions,
            ensureWebPushIndexes,
        },
        { parseNotificationId },
    ] = await Promise.all([import("mongodb"), import("../data/db"), import("../data/notification-read")]);

    const toObjectId = (id: unknown) => {
        if (id instanceof ObjectId) return id;
        if (typeof id === "string" && ObjectId.isValid(id)) return new ObjectId(id);
        return id as any;
    };

    return {
        ensureIndexes: ensureWebPushIndexes,
        async findUsersByDids(dids) {
            if (!dids.length) return [];
            return (await Circles.find(
                { did: { $in: dids }, circleType: "user" },
                {
                    projection: {
                        did: 1,
                        handle: 1,
                        accountStatus: 1,
                        pushPreferences: 1,
                        notificationPauseConfig: 1,
                    },
                },
            ).toArray()) as PushRecipientRecord[];
        },
        async findActiveSubscriptionsByUsers(dids) {
            if (!dids.length) return [];
            return (await PushSubscriptions.find({
                userDid: { $in: dids },
                revokedAt: { $exists: false },
            }).toArray()) as PushSubscriptionDoc[];
        },
        async findSubscriptionById(subscriptionId) {
            return (await PushSubscriptions.findOne({ _id: toObjectId(subscriptionId) })) as PushSubscriptionDoc | null;
        },
        async upsertDeliveryJob(job) {
            const result = await PushDeliveryJobs.updateOne(
                { deliveryKey: job.deliveryKey },
                { $setOnInsert: job as PushDeliveryJobDoc },
                { upsert: true },
            );
            return (result.upsertedCount ?? 0) === 1;
        },
        async claimNextDueJob(now, leaseUntil, processingToken) {
            return (await PushDeliveryJobs.findOneAndUpdate(
                {
                    $or: [
                        { status: "pending", nextAttemptAt: { $lte: now } },
                        { status: "processing", leaseUntil: { $lte: now } },
                    ],
                },
                {
                    $set: {
                        status: "processing",
                        leaseUntil,
                        processingToken,
                        updatedAt: now,
                    },
                    $inc: { attempts: 1 },
                },
                {
                    sort: { nextAttemptAt: 1, createdAt: 1 },
                    returnDocument: "after",
                },
            )) as PushDeliveryJobDoc | null;
        },
        async finishJob(jobId, processingToken, update) {
            const setFields: Record<string, unknown> = {
                status: update.status,
                updatedAt: update.now,
            };
            if (update.nextAttemptAt !== undefined) setFields.nextAttemptAt = update.nextAttemptAt;
            if (update.lastStatusCode !== undefined) setFields.lastStatusCode = update.lastStatusCode;
            if (update.lastError !== undefined) setFields.lastError = update.lastError;
            if (update.completedAt !== undefined) setFields.completedAt = update.completedAt;

            const result = await PushDeliveryJobs.updateOne(
                {
                    _id: toObjectId(jobId),
                    status: "processing",
                    processingToken,
                },
                {
                    $set: setFields,
                    $unset: { leaseUntil: "", processingToken: "" },
                },
            );
            return (result.modifiedCount ?? 0) === 1;
        },
        async isNotificationRead(notificationId, userDid) {
            const parsedId = parseNotificationId(notificationId);
            if (parsedId === null) return false;
            const doc = await Notifications.findOne(
                { _id: parsedId as any, userId: userDid },
                { projection: { isRead: 1 } },
            );
            return doc?.isRead === true;
        },
        async isConversationMuted(conversationId, userDid) {
            if (!conversationId) return false;
            const pref = await ChatConversationPreferences.findOne(
                { conversationId, userDid, notificationsMuted: true },
                { projection: { _id: 1 } },
            );
            return Boolean(pref);
        },
        async revokeSubscriptionAndCancelJobs(subscriptionId, reason, now) {
            const objId = toObjectId(subscriptionId);
            await PushSubscriptions.updateOne(
                { _id: objId, revokedAt: { $exists: false } },
                { $set: { revokedAt: now, revokeReason: reason } },
            );
            await PushDeliveryJobs.updateMany(
                {
                    subscriptionId: { $in: [objId, String(subscriptionId)] },
                    status: "pending",
                },
                {
                    $set: {
                        status: "skipped",
                        lastError: reason,
                        updatedAt: now,
                        completedAt: now,
                    },
                },
            );
        },
    };
}

async function resolveDeps(deps?: PushDispatcherDeps) {
    const store = deps?.store ?? (await createMongoDispatcherStore());
    const sendPush =
        deps?.sendPush ??
        (await import("./web-push-adapter")).sendWebPushNotification;
    return {
        env: deps?.env ?? process.env,
        now: deps?.now ?? (() => new Date()),
        random: deps?.random ?? Math.random,
        store,
        sendPush,
    };
}

export async function enqueuePushJobsForNotifications(
    notifications: PushDispatcherNotificationInput[],
    deps?: PushDispatcherDeps,
): Promise<PushEnqueueStats> {
    const env = deps?.env ?? process.env;
    if (!isWebPushDispatchEnabled(env) || !notifications.length) {
        return { enqueued: 0, skipped: notifications.length };
    }

    const { now: nowFn, store } = await resolveDeps(deps);
    await store.ensureIndexes?.();
    const now = nowFn();

    const recipientDids = Array.from(
        new Set(notifications.map((n) => n.userId).filter((did) => typeof did === "string" && did.length > 0)),
    );
    if (!recipientDids.length) {
        return { enqueued: 0, skipped: notifications.length };
    }

    const [users, subscriptions] = await Promise.all([
        store.findUsersByDids(recipientDids),
        store.findActiveSubscriptionsByUsers(recipientDids),
    ]);

    const userByDid = new Map(users.map((u) => [u.did, u]));
    const subsByDid = new Map<string, PushSubscriptionDoc[]>();
    for (const sub of subscriptions) {
        if (sub.revokedAt || !sub._id) continue;
        const list = subsByDid.get(sub.userDid) ?? [];
        list.push(sub);
        subsByDid.set(sub.userDid, list);
    }

    let enqueued = 0;
    let skipped = 0;

    for (const notification of notifications) {
        const notificationId = notification._id ? String(notification._id) : "";
        if (!notificationId || !notification.userId) {
            skipped += 1;
            continue;
        }

        const user = userByDid.get(notification.userId);
        const userSubs = subsByDid.get(notification.userId) ?? [];
        if (!userSubs.length || !isRecipientEligibleForPush(user, notification.type, now)) {
            skipped += 1;
            continue;
        }

        const payload = buildGenericPushPayload({
            notificationId,
            type: notification.type,
            content: notification.content,
            recipientHandle: user?.handle,
        });
        const expiresAt = new Date(now.getTime() + PUSH_JOB_TTL_MS);

        for (const sub of userSubs) {
            const subId = String(sub._id);
            const inserted = await store.upsertDeliveryJob({
                deliveryKey: `${notificationId}:${subId}`,
                notificationId,
                userDid: notification.userId,
                subscriptionId: sub._id!,
                notificationType: notification.type,
                payload,
                status: "pending",
                attempts: 0,
                nextAttemptAt: now,
                expiresAt,
                createdAt: now,
                updatedAt: now,
            });
            if (inserted) {
                enqueued += 1;
            }
        }
    }

    return { enqueued, skipped };
}

export async function processPendingPushJobs(
    limit = 50,
    deps?: PushDispatcherDeps,
): Promise<PushDispatchStats> {
    const stats: PushDispatchStats = {
        claimed: 0,
        accepted: 0,
        retried: 0,
        revoked: 0,
        skipped: 0,
        expired: 0,
        failed: 0,
    };

    const env = deps?.env ?? process.env;
    if (!isWebPushDispatchEnabled(env)) {
        return stats;
    }

    const { now: nowFn, random, store, sendPush } = await resolveDeps(deps);
    await store.ensureIndexes?.();

    const maxClaims = Math.min(Math.max(0, limit), 100);
    for (let i = 0; i < maxClaims; i += 1) {
        const now = nowFn();
        const token = crypto.randomUUID();
        const leaseUntil = new Date(now.getTime() + PUSH_JOB_LEASE_MS);
        const job = await store.claimNextDueJob(now, leaseUntil, token);
        if (!job?._id) {
            break;
        }

        stats.claimed += 1;

        if (job.expiresAt.getTime() <= now.getTime()) {
            await store.finishJob(job._id, token, {
                status: "expired",
                lastError: "expired",
                completedAt: now,
                now,
            });
            stats.expired += 1;
            continue;
        }

        const [subscription, users, isRead] = await Promise.all([
            store.findSubscriptionById(job.subscriptionId),
            store.findUsersByDids([job.userDid]),
            store.isNotificationRead(job.notificationId, job.userDid),
        ]);

        if (!subscription || subscription.revokedAt || subscription.userDid !== job.userDid) {
            await store.finishJob(job._id, token, {
                status: "skipped",
                lastError: "subscription_inactive",
                completedAt: now,
                now,
            });
            stats.skipped += 1;
            continue;
        }

        const user = users[0];
        if (!isRecipientEligibleForPush(user, job.notificationType, now)) {
            await store.finishJob(job._id, token, {
                status: "skipped",
                lastError: "recipient_ineligible",
                completedAt: now,
                now,
            });
            stats.skipped += 1;
            continue;
        }

        if (isRead) {
            await store.finishJob(job._id, token, {
                status: "skipped",
                lastError: "already_read",
                completedAt: now,
                now,
            });
            stats.skipped += 1;
            continue;
        }

        if (
            (job.notificationType === "pm_received" || job.notificationType === "chat_mention") &&
            job.payload.tag?.startsWith("chat:")
        ) {
            const roomId = job.payload.tag.slice("chat:".length);
            if (await store.isConversationMuted(roomId, job.userDid)) {
                await store.finishJob(job._id, token, {
                    status: "skipped",
                    lastError: "conversation_muted",
                    completedAt: now,
                    now,
                });
                stats.skipped += 1;
                continue;
            }
        }

        const remainingTtlSeconds = Math.min(
            86_400,
            Math.max(60, Math.floor((job.expiresAt.getTime() - now.getTime()) / 1000)),
        );

        const outcome = await sendPush(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            job.payload,
            { ttlSeconds: remainingTtlSeconds, env },
        );

        if (outcome.outcome === "accepted") {
            await store.finishJob(job._id, token, {
                status: "accepted",
                lastStatusCode: outcome.statusCode,
                completedAt: now,
                now,
            });
            stats.accepted += 1;
            continue;
        }

        if (outcome.outcome === "permanent_revoke") {
            await store.revokeSubscriptionAndCancelJobs(subscription._id!, outcome.errorCode, now);
            await store.finishJob(job._id, token, {
                status: "failed",
                lastStatusCode: outcome.statusCode,
                lastError: "subscription_gone",
                completedAt: now,
                now,
            });
            stats.revoked += 1;
            stats.failed += 1;
            continue;
        }

        if (outcome.outcome === "retryable") {
            const delayMs = computeNextRetryDelayMs(job.attempts, outcome.retryAfterSeconds, random);
            const nextAttemptAt = new Date(now.getTime() + delayMs);
            if (job.attempts >= PUSH_JOB_MAX_ATTEMPTS || nextAttemptAt.getTime() >= job.expiresAt.getTime()) {
                await store.finishJob(job._id, token, {
                    status: "failed",
                    lastStatusCode: outcome.statusCode,
                    lastError: outcome.errorCode,
                    completedAt: now,
                    now,
                });
                stats.failed += 1;
            } else {
                await store.finishJob(job._id, token, {
                    status: "pending",
                    nextAttemptAt,
                    lastStatusCode: outcome.statusCode,
                    lastError: outcome.errorCode,
                    now,
                });
                stats.retried += 1;
            }
            continue;
        }

        console.error("Web Push configuration/client error:", {
            jobId: String(job._id),
            statusCode: outcome.statusCode,
            errorCode: outcome.errorCode,
        });
        await store.finishJob(job._id, token, {
            status: "failed",
            lastStatusCode: outcome.statusCode,
            lastError: outcome.errorCode,
            completedAt: now,
            now,
        });
        stats.failed += 1;
    }

    return stats;
}
