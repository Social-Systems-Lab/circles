const IDENTITY_KEYS = new Set(["circle", "user", "artistCircle", "targetParentCircle", "subject"]);

const ENTITY_FIELDS: Record<string, readonly string[]> = {
    post: ["_id", "createdBy", "feedId", "postType", "parentItemType", "parentItemId"],
    comment: ["_id", "postId", "createdBy", "parentCommentId"],
    event: ["_id", "title", "circleId", "startAt", "endAt"],
    task: ["_id", "title", "stage", "circleId"],
    issue: ["_id", "title", "stage", "circleId"],
    goal: ["_id", "title", "stage", "circleId"],
    proposal: ["_id", "name", "stage", "circleId"],
    project: ["_id", "name", "handle", "circleType"],
};

const IDENTITY_FIELDS = ["_id", "did", "handle", "name", "picture", "circleType"] as const;
const PICTURE_FIELDS = ["originalName", "fileName", "url"] as const;

// These are the scalar values consumed by the bell, its navigation/actions, external PM delivery,
// or notification-record cleanup. Unknown top-level fields are deliberately discarded.
const SCALAR_FIELDS = new Set([
    "body",
    "url",
    "postId",
    "commentId",
    "reaction",
    "roomId",
    "topicId",
    "topicTitle",
    "messageId",
    "messagePreview",
    "projectId",
    "proposalId",
    "proposalName",
    "proposalOutcome",
    "proposalResolvedAtStage",
    "issueId",
    "issueTitle",
    "issueOldStage",
    "issueNewStage",
    "previousStage",
    "newStage",
    "taskId",
    "taskTitle",
    "taskOldStage",
    "taskNewStage",
    "previousTaskStage",
    "newTaskStage",
    "goalId",
    "goalTitle",
    "goalOldStage",
    "goalNewStage",
    "previousGoalStage",
    "newGoalStage",
    "eventId",
    "eventName",
    "eventTitle",
    "eventOldStage",
    "eventNewStage",
    "invitationMessage",
    "invitationId",
]);

const isBsonValue = (value: object): boolean => "_bsontype" in value;
const isScalar = (value: unknown): boolean =>
    value === null || typeof value !== "object" || value instanceof Date || isBsonValue(value as object);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value) && !isScalar(value);

const pickScalarFields = (value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> => {
    const shaped: Record<string, unknown> = {};
    for (const field of fields) {
        const fieldValue = value[field];
        if (fieldValue !== undefined && isScalar(fieldValue)) {
            shaped[field] = field === "_id" && fieldValue !== null ? String(fieldValue) : fieldValue;
        }
    }
    return shaped;
};

const shapePicture = (value: unknown): unknown => {
    if (typeof value === "string") return value;
    return isRecord(value) ? pickScalarFields(value, PICTURE_FIELDS) : undefined;
};

const shapeIdentity = (value: Record<string, unknown>): Record<string, unknown> => {
    const shaped = pickScalarFields(
        value,
        IDENTITY_FIELDS.filter((field) => field !== "picture"),
    );
    const picture = shapePicture(value.picture);
    if (picture !== undefined) shaped.picture = picture;
    return shaped;
};

const shapeValue = (key: string, value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => shapeValue(key, item)).filter((item) => item !== undefined);
    }
    if (IDENTITY_KEYS.has(key)) return isRecord(value) ? shapeIdentity(value) : isScalar(value) ? value : undefined;
    if (ENTITY_FIELDS[key]) return isRecord(value) ? pickScalarFields(value, ENTITY_FIELDS[key]) : undefined;
    if (!SCALAR_FIELDS.has(key)) return undefined;
    return isScalar(value) ? value : undefined;
};

export function shapeNotificationContent<T>(content: T): T {
    if (!isRecord(content)) return content;
    const shaped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
        const next = shapeValue(key, value);
        if (next !== undefined) shaped[key] = next;
    }
    return shaped as T;
}

export function shapeStoredNotifications<T extends { content?: unknown }>(notifications: T[]): T[] {
    return notifications.map((notification) => ({
        ...notification,
        content: shapeNotificationContent(notification.content),
    }));
}

export function shapeReminderNotificationContents(notifications: Array<{ content?: unknown }>): unknown[] {
    return notifications.map((notification) => shapeNotificationContent(notification.content));
}

export async function filterNotificationRecipientsWhoCanViewPost<TPost, TRecipient extends { did?: string }>(
    post: TPost,
    recipients: TRecipient[],
    canViewPost: (post: TPost, userDid?: string) => Promise<boolean>,
): Promise<TRecipient[]> {
    const allowed = await Promise.all(
        recipients.map((recipient) =>
            typeof recipient.did === "string" ? canViewPost(post, recipient.did) : Promise.resolve(false),
        ),
    );
    return recipients.filter((_, index) => allowed[index]);
}
