import type { ObjectId } from "mongodb";

export type PushSubscriptionKeys = {
    p256dh: string;
    auth: string;
};

export type PushSubscriptionDoc = {
    _id?: ObjectId | string;
    userDid: string;
    endpoint: string;
    endpointHash: string;
    keys: PushSubscriptionKeys;
    userAgentSummary?: string;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt?: Date;
    revokeReason?: string;
};

export type PushSubscriptionSummary = {
    id: string;
    createdAt: string;
    lastSeenAt: string;
    userAgentSummary?: string;
};

export type PushDeliveryJobStatus = "pending" | "processing" | "accepted" | "failed" | "skipped" | "expired";

export type PushNotificationPayload = {
    notificationId?: string;
    title: string;
    body: string;
    url: string;
    tag?: string;
};

export type PushDeliveryJobDoc = {
    _id?: ObjectId | string;
    deliveryKey: string;
    notificationId: string;
    userDid: string;
    subscriptionId: ObjectId | string;
    notificationType: string;
    payload: PushNotificationPayload;
    status: PushDeliveryJobStatus;
    attempts: number;
    nextAttemptAt: Date;
    leaseUntil?: Date;
    processingToken?: string;
    expiresAt: Date;
    lastStatusCode?: number;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
};

export const PUSH_NOTIFICATION_CATEGORIES = ["messages", "events", "tasks", "community", "account"] as const;
export type PushNotificationCategoryKey = (typeof PUSH_NOTIFICATION_CATEGORIES)[number];

export type PushNotificationPreferences = {
    enabled: boolean;
    categories: Record<PushNotificationCategoryKey, boolean>;
};

export const DEFAULT_PUSH_NOTIFICATION_PREFERENCES: PushNotificationPreferences = {
    enabled: true,
    categories: {
        messages: true,
        events: true,
        tasks: true,
        community: true,
        account: true,
    },
};
