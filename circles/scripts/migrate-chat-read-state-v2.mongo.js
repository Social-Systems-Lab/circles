// Idempotent migration for persistent per-topic read cursors.
// SAFETY: run only while every old application writer is stopped.

const READ_STATE_VERSION = 2;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

function historicalBoundary(state) {
    if (typeof state.lastReadMessageId === "string" && objectIdPattern.test(state.lastReadMessageId)) {
        return state.lastReadMessageId.toLowerCase();
    }
    if (!(state.updatedAt instanceof Date) || Number.isNaN(state.updatedAt.getTime())) {
        throw new Error(`Cannot safely migrate chatReadStates row without updatedAt: ${state._id}`);
    }
    const nextSecond = ObjectId.createFromTime(Math.floor(state.updatedAt.getTime() / 1000) + 1);
    const message = db.chatMessageDocs
        .find(
            {
                conversationId: state.conversationId,
                _id: { $lt: nextSecond },
                $or: [{ createdAt: { $lte: state.updatedAt } }, { createdAt: { $exists: false } }],
            },
            { _id: 1 },
        )
        .sort({ _id: -1 })
        .limit(1)
        .next();
    return message?._id ? message._id.toString() : null;
}

let migrated = 0;
let raced = 0;
const candidates = db.chatReadStates.find({ readStateVersion: { $ne: READ_STATE_VERSION } }).toArray();

for (const candidate of candidates) {
    const state = db.chatReadStates.findOne({ _id: candidate._id });
    if (!state || state.readStateVersion === READ_STATE_VERSION) continue;
    const boundary = historicalBoundary(state);
    const result = db.chatReadStates.updateOne(
        {
            _id: state._id,
            readStateVersion: { $ne: READ_STATE_VERSION },
            lastReadMessageId: state.lastReadMessageId,
            updatedAt: state.updatedAt,
        },
        {
            $set: {
                topicFallbackMessageId: boundary,
                legacyLastReadMessageId: boundary,
                readStateVersion: READ_STATE_VERSION,
                readStateMigratedAt: new Date(),
            },
        },
    );
    if (result.modifiedCount === 1) migrated += 1;
    else raced += 1;
}

const remaining = db.chatReadStates.countDocuments({ readStateVersion: { $ne: READ_STATE_VERSION } });
printjson({ migration: "chat-read-state-v2", candidates: candidates.length, migrated, raced, remaining });
