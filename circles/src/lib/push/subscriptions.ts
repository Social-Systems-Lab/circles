import type { PushSubscriptionDoc, PushSubscriptionKeys, PushSubscriptionSummary } from "./types";
import { hashPushEndpoint } from "./validation";

export type PushSubscriptionStore = {
    ensureIndexes?: () => Promise<void>;
    findByEndpointHash: (endpointHash: string) => Promise<PushSubscriptionDoc | null>;
    insert: (doc: Omit<PushSubscriptionDoc, "_id">) => Promise<string>;
    updateById: (
        id: PushSubscriptionDoc["_id"],
        fields: {
            userDid?: string;
            endpoint?: string;
            keys?: PushSubscriptionKeys;
            userAgentSummary?: string;
            lastSeenAt?: Date;
            clearRevoked?: boolean;
        },
    ) => Promise<void>;
    cancelPendingJobsForSubscription: (
        subscriptionId: PushSubscriptionDoc["_id"],
        reason: string,
        now: Date,
    ) => Promise<number>;
    findActiveByUser: (userDid: string) => Promise<PushSubscriptionDoc[]>;
    findOwnedByUser: (
        userDid: string,
        filter: { subscriptionId?: string; endpointHash?: string },
    ) => Promise<PushSubscriptionDoc | null>;
    revokeById: (id: PushSubscriptionDoc["_id"], reason: string, now: Date) => Promise<boolean>;
};

async function createMongoPushSubscriptionStore(): Promise<PushSubscriptionStore> {
    const [{ ObjectId }, { PushDeliveryJobs, PushSubscriptions, ensureWebPushIndexes }] = await Promise.all([
        import("mongodb"),
        import("../data/db"),
    ]);

    const toObjectId = (id: PushSubscriptionDoc["_id"]) => {
        if (id instanceof ObjectId) return id;
        if (typeof id === "string" && ObjectId.isValid(id)) return new ObjectId(id);
        return id as any;
    };

    return {
        ensureIndexes: ensureWebPushIndexes,
        async findByEndpointHash(endpointHash) {
            return (await PushSubscriptions.findOne({ endpointHash })) as PushSubscriptionDoc | null;
        },
        async insert(doc) {
            const result = await PushSubscriptions.insertOne(doc as PushSubscriptionDoc);
            return result.insertedId.toString();
        },
        async updateById(id, fields) {
            const setFields: Record<string, unknown> = {};
            const unsetFields: Record<string, ""> = {};

            if (fields.userDid !== undefined) setFields.userDid = fields.userDid;
            if (fields.endpoint !== undefined) setFields.endpoint = fields.endpoint;
            if (fields.keys !== undefined) setFields.keys = fields.keys;
            if (fields.userAgentSummary !== undefined) setFields.userAgentSummary = fields.userAgentSummary;
            if (fields.lastSeenAt !== undefined) setFields.lastSeenAt = fields.lastSeenAt;
            if (fields.clearRevoked) {
                unsetFields.revokedAt = "";
                unsetFields.revokeReason = "";
            }

            await PushSubscriptions.updateOne(
                { _id: toObjectId(id) },
                {
                    ...(Object.keys(setFields).length ? { $set: setFields } : {}),
                    ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
                },
            );
        },
        async cancelPendingJobsForSubscription(subscriptionId, reason, now) {
            const idStr = String(subscriptionId);
            const result = await PushDeliveryJobs.updateMany(
                {
                    subscriptionId: { $in: [toObjectId(subscriptionId), idStr] },
                    status: { $in: ["pending", "processing"] },
                },
                {
                    $set: {
                        status: "skipped",
                        lastError: reason,
                        updatedAt: now,
                        completedAt: now,
                    },
                    $unset: {
                        leaseUntil: "",
                        processingToken: "",
                    },
                },
            );
            return result.modifiedCount ?? 0;
        },
        async findActiveByUser(userDid) {
            return (await PushSubscriptions.find({
                userDid,
                revokedAt: { $exists: false },
            })
                .sort({ lastSeenAt: -1 })
                .toArray()) as PushSubscriptionDoc[];
        },
        async findOwnedByUser(userDid, filter) {
            if (filter.subscriptionId) {
                if (!ObjectId.isValid(filter.subscriptionId)) {
                    return null;
                }
                return (await PushSubscriptions.findOne({
                    _id: new ObjectId(filter.subscriptionId),
                    userDid,
                    revokedAt: { $exists: false },
                })) as PushSubscriptionDoc | null;
            }
            if (filter.endpointHash) {
                return (await PushSubscriptions.findOne({
                    endpointHash: filter.endpointHash,
                    userDid,
                    revokedAt: { $exists: false },
                })) as PushSubscriptionDoc | null;
            }
            return null;
        },
        async revokeById(id, reason, now) {
            const result = await PushSubscriptions.updateOne(
                { _id: toObjectId(id), revokedAt: { $exists: false } },
                {
                    $set: {
                        revokedAt: now,
                        revokeReason: reason,
                    },
                },
            );
            return (result.modifiedCount ?? 0) > 0;
        },
    };
}

async function resolveStore(store?: PushSubscriptionStore): Promise<PushSubscriptionStore> {
    return store ?? createMongoPushSubscriptionStore();
}

export async function upsertPushSubscription(
    input: {
        userDid: string;
        endpoint: string;
        keys: PushSubscriptionKeys;
        userAgentSummary?: string;
    },
    storeOverride?: PushSubscriptionStore,
    now: Date = new Date(),
): Promise<{ subscriptionId: string; reboundFromOtherUser: boolean; cancelledPendingJobs: number }> {
    const store = await resolveStore(storeOverride);
    await store.ensureIndexes?.();

    const endpointHash = hashPushEndpoint(input.endpoint);
    const existing = await store.findByEndpointHash(endpointHash);

    if (existing?._id) {
        const reboundFromOtherUser = existing.userDid !== input.userDid;
        let cancelledPendingJobs = 0;

        if (reboundFromOtherUser) {
            cancelledPendingJobs = await store.cancelPendingJobsForSubscription(
                existing._id,
                "subscription_rebound",
                now,
            );
        }

        await store.updateById(existing._id, {
            userDid: input.userDid,
            endpoint: input.endpoint,
            keys: input.keys,
            userAgentSummary: input.userAgentSummary,
            lastSeenAt: now,
            clearRevoked: true,
        });

        return {
            subscriptionId: String(existing._id),
            reboundFromOtherUser,
            cancelledPendingJobs,
        };
    }

    const subscriptionId = await store.insert({
        userDid: input.userDid,
        endpoint: input.endpoint,
        endpointHash,
        keys: input.keys,
        ...(input.userAgentSummary ? { userAgentSummary: input.userAgentSummary } : {}),
        createdAt: now,
        lastSeenAt: now,
    });

    return {
        subscriptionId,
        reboundFromOtherUser: false,
        cancelledPendingJobs: 0,
    };
}

export async function revokePushSubscriptionForUser(
    input: {
        userDid: string;
        subscriptionId?: string;
        endpoint?: string;
        reason?: string;
    },
    storeOverride?: PushSubscriptionStore,
    now: Date = new Date(),
): Promise<{ revoked: boolean; subscriptionId?: string; cancelledPendingJobs: number }> {
    const store = await resolveStore(storeOverride);
    await store.ensureIndexes?.();

    const endpointHash = input.endpoint ? hashPushEndpoint(input.endpoint) : undefined;
    const owned = await store.findOwnedByUser(input.userDid, {
        subscriptionId: input.subscriptionId,
        endpointHash,
    });

    if (!owned?._id) {
        return { revoked: false, cancelledPendingJobs: 0 };
    }

    const reason = input.reason || "user_revoked";
    const revoked = await store.revokeById(owned._id, reason, now);
    const cancelledPendingJobs = await store.cancelPendingJobsForSubscription(owned._id, reason, now);

    return {
        revoked,
        subscriptionId: String(owned._id),
        cancelledPendingJobs,
    };
}

export async function revokePushSubscriptionById(
    subscriptionId: PushSubscriptionDoc["_id"],
    reason: string,
    storeOverride?: PushSubscriptionStore,
    now: Date = new Date(),
): Promise<boolean> {
    const store = await resolveStore(storeOverride);
    await store.ensureIndexes?.();
    const revoked = await store.revokeById(subscriptionId, reason, now);
    await store.cancelPendingJobsForSubscription(subscriptionId, reason, now);
    return revoked;
}

export async function getActivePushSubscriptionDocsForUser(
    userDid: string,
    storeOverride?: PushSubscriptionStore,
): Promise<PushSubscriptionDoc[]> {
    const store = await resolveStore(storeOverride);
    await store.ensureIndexes?.();
    return store.findActiveByUser(userDid);
}

export async function listActivePushSubscriptionsForUser(
    userDid: string,
    storeOverride?: PushSubscriptionStore,
): Promise<PushSubscriptionSummary[]> {
    const docs = await getActivePushSubscriptionDocsForUser(userDid, storeOverride);
    return docs.map((doc) => ({
        id: String(doc._id),
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
        lastSeenAt:
            doc.lastSeenAt instanceof Date ? doc.lastSeenAt.toISOString() : new Date(doc.lastSeenAt).toISOString(),
        ...(doc.userAgentSummary ? { userAgentSummary: doc.userAgentSummary } : {}),
    }));
}
