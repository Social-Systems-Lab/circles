import { normalizeObjectIdHex, CHAT_READ_STATE_VERSION } from "./topic-read-state";

export type LegacyReadStateSnapshot = {
    _id?: any;
    lastReadMessageId: string | null;
    updatedAt: Date;
};

export const resolveHistoricalReadBoundary = async (
    snapshot: LegacyReadStateSnapshot,
    findLatestAtOrBefore: (updatedAt: Date) => Promise<string | null>,
): Promise<string | null> => {
    const existingBoundary = normalizeObjectIdHex(snapshot.lastReadMessageId);
    if (existingBoundary) return existingBoundary;
    if (!(snapshot.updatedAt instanceof Date) || Number.isNaN(snapshot.updatedAt.getTime())) {
        throw new Error("Cannot safely migrate chat read state without updatedAt");
    }
    return normalizeObjectIdHex(await findLatestAtOrBefore(snapshot.updatedAt));
};

export const buildReadStateV2InitializationOperation = (
    snapshot: LegacyReadStateSnapshot,
    frozenBoundary: string | null,
    migratedAt: Date,
) => ({
    filter: {
        _id: snapshot._id as any,
        readStateVersion: { $ne: CHAT_READ_STATE_VERSION },
        lastReadMessageId: snapshot.lastReadMessageId,
        updatedAt: snapshot.updatedAt,
    },
    update: {
        $set: {
            topicFallbackMessageId: frozenBoundary,
            legacyLastReadMessageId: frozenBoundary,
            readStateVersion: CHAT_READ_STATE_VERSION,
            readStateMigratedAt: migratedAt,
        },
    },
});

export const buildMonotonicLegacyCursorUpdate = (cursor: string | null, updatedAt: Date) => {
    const normalizedCursor = normalizeObjectIdHex(cursor);
    if (cursor && !normalizedCursor) throw new Error("Invalid legacy read cursor");
    return normalizedCursor
        ? { $max: { legacyLastReadMessageId: normalizedCursor }, $set: { updatedAt } }
        : { $set: { updatedAt } };
};
