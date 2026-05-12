import { ObjectId } from "mongodb";
import { Circles, Notifications } from "./db";
import { sendEmail } from "./email";
import type { NotificationType } from "@/models/models";

const DAILY_DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROCESS_LIMIT = 100;

const DIGEST_CATEGORY_DEFINITIONS = [
    {
        preferenceKey: "emailMissedMessages",
        notificationTypes: ["pm_received"],
        summaryLabel: "unread direct message",
        defaultEnabled: true,
    },
    {
        preferenceKey: "emailTaskAssigned",
        notificationTypes: ["task_assigned"],
        summaryLabel: "task assignment",
        defaultEnabled: false,
    },
    {
        preferenceKey: "emailTaskUpdates",
        notificationTypes: ["task_changes_requested", "task_verified", "task_status_changed"],
        summaryLabel: "task update",
        defaultEnabled: false,
    },
    {
        preferenceKey: "emailVerificationUpdates",
        notificationTypes: ["user_verification_clarification_requested", "user_verification_reply_received"],
        summaryLabel: "verification or admin thread needing your response",
        defaultEnabled: false,
    },
] as const;

type DigestCategoryDefinition = (typeof DIGEST_CATEGORY_DEFINITIONS)[number];
type ActionableNotificationType = DigestCategoryDefinition["notificationTypes"][number];

type DigestCandidateUser = {
    _id: ObjectId;
    did: string;
    email: string;
    name?: string;
    handle?: string;
    emailMissedMessages?: boolean;
    emailTaskAssigned?: boolean;
    emailTaskUpdates?: boolean;
    emailVerificationUpdates?: boolean;
    lastActionableEmailDigestAt?: Date;
};

const getEmailBaseUrl = (): string => (process.env.CIRCLES_URL || "http://localhost:3000").replace(/\/+$/, "");

const pluralize = (count: number, singular: string): string => (count === 1 ? singular : `${singular}s`);

const isCategoryEnabled = (user: DigestCandidateUser, category: DigestCategoryDefinition): boolean => {
    const value = user[category.preferenceKey];
    if (category.defaultEnabled) {
        return value !== false;
    }

    return value === true;
};

const buildDigestSummaryLines = (counts: Map<string, number>): string[] =>
    DIGEST_CATEGORY_DEFINITIONS.flatMap((category) => {
        const count = counts.get(category.preferenceKey) || 0;
        if (count <= 0) {
            return [];
        }

        return [`${count} ${pluralize(count, category.summaryLabel)}`];
    });

const markNotificationsEmailed = async (notificationIds: ObjectId[], sentAt: Date) => {
    if (!notificationIds.length) {
        return;
    }

    await Notifications.updateMany({ _id: { $in: notificationIds } }, { $set: { lastEmailedAt: sentAt } });
};

const markUserDigestSent = async (userId: ObjectId, sentAt: Date) => {
    await Circles.updateOne(
        { _id: userId },
        {
            $set: {
                lastActionableEmailDigestAt: sentAt,
            },
        },
    );
};

const getCandidateUsers = async (cutoff: Date, limit: number): Promise<DigestCandidateUser[]> =>
    (await Circles.find(
        {
            circleType: "user",
            did: { $exists: true, $type: "string", $ne: "" },
            email: { $exists: true, $type: "string", $ne: "" },
            $or: [
                { emailMissedMessages: { $ne: false } },
                { emailTaskAssigned: true },
                { emailTaskUpdates: true },
                { emailVerificationUpdates: true },
            ],
            $and: [
                {
                    $or: [
                        { lastActionableEmailDigestAt: { $exists: false } },
                        { lastActionableEmailDigestAt: { $lte: cutoff } },
                    ],
                },
            ],
        },
        {
            projection: {
                did: 1,
                email: 1,
                name: 1,
                handle: 1,
                emailMissedMessages: 1,
                emailTaskAssigned: 1,
                emailTaskUpdates: 1,
                emailVerificationUpdates: 1,
                lastActionableEmailDigestAt: 1,
            },
        },
    )
        .sort({ lastActionableEmailDigestAt: 1, _id: 1 })
        .limit(Math.max(1, limit))
        .toArray()) as DigestCandidateUser[];

const getEnabledNotificationTypes = (user: DigestCandidateUser): NotificationType[] =>
    DIGEST_CATEGORY_DEFINITIONS.flatMap((category) =>
        isCategoryEnabled(user, category) ? [...category.notificationTypes] : [],
    );

export const processDailyActionableEmailDigests = async (limit: number = DEFAULT_PROCESS_LIMIT) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - DAILY_DIGEST_INTERVAL_MS);
    const stats = {
        scannedUsers: 0,
        eligibleUsers: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
    };

    if (!process.env.POSTMARK_API_TOKEN || !process.env.POSTMARK_SENDER_EMAIL) {
        return stats;
    }

    const candidateUsers = await getCandidateUsers(cutoff, limit);
    const baseUrl = getEmailBaseUrl();

    for (const user of candidateUsers) {
        stats.scannedUsers += 1;

        const enabledNotificationTypes = getEnabledNotificationTypes(user);
        if (!enabledNotificationTypes.length) {
            stats.skipped += 1;
            continue;
        }

        const unreadNotifications = await Notifications.find(
            {
                userId: user.did,
                isRead: false,
                type: { $in: enabledNotificationTypes },
            },
            {
                projection: {
                    _id: 1,
                    type: 1,
                    createdAt: 1,
                },
            },
        ).toArray();

        if (!unreadNotifications.length) {
            stats.skipped += 1;
            continue;
        }

        const hasDigestEligibleActivity = unreadNotifications.some((notification) => notification.createdAt <= cutoff);
        if (!hasDigestEligibleActivity) {
            stats.skipped += 1;
            continue;
        }

        const counts = new Map<string, number>();
        for (const category of DIGEST_CATEGORY_DEFINITIONS) {
            if (!isCategoryEnabled(user, category)) {
                continue;
            }

            const notificationTypes = category.notificationTypes as readonly ActionableNotificationType[];
            const count = unreadNotifications.filter((notification) =>
                notificationTypes.includes(notification.type as ActionableNotificationType),
            ).length;
            if (count > 0) {
                counts.set(category.preferenceKey, count);
            }
        }

        const summaryLines = buildDigestSummaryLines(counts);
        if (!summaryLines.length) {
            stats.skipped += 1;
            continue;
        }

        stats.eligibleUsers += 1;

        try {
            await sendEmail({
                to: user.email,
                templateAlias: "notification-reminder",
                templateModel: {
                    name: user.name || user.handle || "there",
                    notifications: summaryLines,
                    actionUrl: baseUrl,
                    productUrl: baseUrl,
                    introText: "You have activity waiting on Kamooni.",
                    bodyText: "Here is your daily digest of actionable updates.",
                    summaryText: summaryLines.join(" • "),
                    actionText: "Open Kamooni",
                },
            });

            await Promise.all([
                markNotificationsEmailed(
                    unreadNotifications
                        .map((notification) => notification._id)
                        .filter((id): id is ObjectId => id instanceof ObjectId),
                    now,
                ),
                markUserDigestSent(user._id, now),
            ]);

            stats.sent += 1;
        } catch (error) {
            console.error(`Failed to send actionable email digest to ${user.did}:`, error);
            stats.failed += 1;
        }
    }

    return stats;
};
