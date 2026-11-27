import {
    DEFAULT_PUSH_NOTIFICATION_PREFERENCES,
    PUSH_NOTIFICATION_CATEGORIES,
    type PushNotificationCategoryKey,
    type PushNotificationPreferences,
} from "./types";

export const EMAIL_PREFERENCE_KEYS = [
    "emailMissedMessages",
    "emailTaskAssigned",
    "emailTaskUpdates",
    "emailVerificationUpdates",
] as const;

export type EmailPreferenceKey = (typeof EMAIL_PREFERENCE_KEYS)[number];

export type NotificationPreferencesView = {
    push: PushNotificationPreferences;
    email: Record<EmailPreferenceKey, boolean>;
};

export type NotificationPreferencesPatch = {
    push?: {
        enabled?: boolean;
        categories?: Partial<Record<PushNotificationCategoryKey, boolean>>;
    };
    email?: Partial<Record<EmailPreferenceKey, boolean>>;
};

export function normalizePushPreferences(raw: unknown): PushNotificationPreferences {
    const base: PushNotificationPreferences = {
        enabled: DEFAULT_PUSH_NOTIFICATION_PREFERENCES.enabled,
        categories: { ...DEFAULT_PUSH_NOTIFICATION_PREFERENCES.categories },
    };

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return base;
    }

    const record = raw as Record<string, unknown>;
    if (typeof record.enabled === "boolean") {
        base.enabled = record.enabled;
    }

    if (record.categories && typeof record.categories === "object" && !Array.isArray(record.categories)) {
        const categories = record.categories as Record<string, unknown>;
        for (const key of PUSH_NOTIFICATION_CATEGORIES) {
            if (typeof categories[key] === "boolean") {
                base.categories[key] = categories[key] as boolean;
            }
        }
    }

    return base;
}

export function extractEmailPreferences(user: Record<string, unknown> | null | undefined): Record<EmailPreferenceKey, boolean> {
    return {
        emailMissedMessages: user?.emailMissedMessages !== false,
        emailTaskAssigned: user?.emailTaskAssigned === true,
        emailTaskUpdates: user?.emailTaskUpdates === true,
        emailVerificationUpdates: user?.emailVerificationUpdates === true,
    };
}

export function parseNotificationPreferencesPatch(
    input: unknown,
): { ok: true; value: NotificationPreferencesPatch } | { ok: false; error: string } {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, error: "Invalid preferences payload" };
    }

    const record = input as Record<string, unknown>;
    const allowedTopLevel = new Set(["push", "email"]);
    for (const key of Object.keys(record)) {
        if (!allowedTopLevel.has(key)) {
            return { ok: false, error: `Unknown preference section: ${key}` };
        }
    }

    const patch: NotificationPreferencesPatch = {};

    if (record.push !== undefined) {
        if (!record.push || typeof record.push !== "object" || Array.isArray(record.push)) {
            return { ok: false, error: "Invalid push preferences section" };
        }
        const pushObj = record.push as Record<string, unknown>;
        for (const key of Object.keys(pushObj)) {
            if (key !== "enabled" && key !== "categories") {
                return { ok: false, error: `Unknown push preference field: ${key}` };
            }
        }

        patch.push = {};
        if (pushObj.enabled !== undefined) {
            if (typeof pushObj.enabled !== "boolean") {
                return { ok: false, error: "push.enabled must be a boolean" };
            }
            patch.push.enabled = pushObj.enabled;
        }

        if (pushObj.categories !== undefined) {
            if (!pushObj.categories || typeof pushObj.categories !== "object" || Array.isArray(pushObj.categories)) {
                return { ok: false, error: "push.categories must be an object" };
            }
            const catObj = pushObj.categories as Record<string, unknown>;
            const validCategories = new Set<string>(PUSH_NOTIFICATION_CATEGORIES);
            patch.push.categories = {};
            for (const [key, value] of Object.entries(catObj)) {
                if (!validCategories.has(key)) {
                    return { ok: false, error: `Unknown push category: ${key}` };
                }
                if (typeof value !== "boolean") {
                    return { ok: false, error: `push.categories.${key} must be a boolean` };
                }
                patch.push.categories[key as PushNotificationCategoryKey] = value;
            }
        }
    }

    if (record.email !== undefined) {
        if (!record.email || typeof record.email !== "object" || Array.isArray(record.email)) {
            return { ok: false, error: "Invalid email preferences section" };
        }
        const emailObj = record.email as Record<string, unknown>;
        const validEmailKeys = new Set<string>(EMAIL_PREFERENCE_KEYS);
        patch.email = {};
        for (const [key, value] of Object.entries(emailObj)) {
            if (!validEmailKeys.has(key)) {
                return { ok: false, error: `Unknown email preference: ${key}` };
            }
            if (typeof value !== "boolean") {
                return { ok: false, error: `email.${key} must be a boolean` };
            }
            patch.email[key as EmailPreferenceKey] = value;
        }
    }

    if (!patch.push && !patch.email) {
        return { ok: false, error: "No preference updates provided" };
    }

    return { ok: true, value: patch };
}

export async function getNotificationPreferencesForUser(userDid: string): Promise<NotificationPreferencesView | null> {
    const { Circles } = await import("../data/db");
    const user = await Circles.findOne(
        { did: userDid, circleType: "user" },
        {
            projection: {
                pushPreferences: 1,
                emailMissedMessages: 1,
                emailTaskAssigned: 1,
                emailTaskUpdates: 1,
                emailVerificationUpdates: 1,
            },
        },
    );

    if (!user) {
        return null;
    }

    return {
        push: normalizePushPreferences((user as Record<string, unknown>).pushPreferences),
        email: extractEmailPreferences(user as Record<string, unknown>),
    };
}

export async function updateNotificationPreferencesForUser(
    userDid: string,
    patch: NotificationPreferencesPatch,
): Promise<NotificationPreferencesView | null> {
    const { Circles } = await import("../data/db");
    const existing = await Circles.findOne(
        { did: userDid, circleType: "user" },
        {
            projection: {
                _id: 1,
                pushPreferences: 1,
                emailMissedMessages: 1,
                emailTaskAssigned: 1,
                emailTaskUpdates: 1,
                emailVerificationUpdates: 1,
            },
        },
    );

    if (!existing) {
        return null;
    }

    const currentPush = normalizePushPreferences((existing as Record<string, unknown>).pushPreferences);
    const nextPush: PushNotificationPreferences = {
        enabled: patch.push?.enabled ?? currentPush.enabled,
        categories: {
            ...currentPush.categories,
            ...(patch.push?.categories ?? {}),
        },
    };

    const setFields: Record<string, unknown> = {};
    if (patch.push) {
        setFields.pushPreferences = nextPush;
    }
    if (patch.email) {
        for (const [key, value] of Object.entries(patch.email)) {
            if (typeof value === "boolean") {
                setFields[key] = value;
            }
        }
    }

    if (Object.keys(setFields).length > 0) {
        await Circles.updateOne({ _id: existing._id }, { $set: setFields });
    }

    const currentEmail = extractEmailPreferences(existing as Record<string, unknown>);
    return {
        push: patch.push ? nextPush : currentPush,
        email: {
            ...currentEmail,
            ...(patch.email ?? {}),
        },
    };
}
