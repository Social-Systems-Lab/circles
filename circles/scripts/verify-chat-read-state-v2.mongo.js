const objectIdPattern = /^[0-9a-f]{24}$/;
const remaining = db.chatReadStates.countDocuments({ readStateVersion: { $ne: 2 } });
const incompleteV2 = db.chatReadStates.countDocuments({
    readStateVersion: 2,
    $or: [
        { topicFallbackMessageId: { $exists: false } },
        { readStateMigratedAt: { $exists: false } },
        { readStateMigratedAt: { $not: { $type: "date" } } },
    ],
});
const malformedV2 = db.chatReadStates.countDocuments({
    readStateVersion: 2,
    $or: [
        { topicFallbackMessageId: { $type: "string", $not: objectIdPattern } },
        { legacyLastReadMessageId: { $type: "string", $not: objectIdPattern } },
    ],
});
const duplicateReadStates = db.chatReadStates
    .aggregate([
        { $group: { _id: { userDid: "$userDid", conversationId: "$conversationId" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 20 },
    ])
    .toArray();
const duplicateTopicReadStates = db.chatTopicReadStates
    .aggregate([
        {
            $group: {
                _id: { userDid: "$userDid", conversationId: "$conversationId", topicId: "$topicId" },
                count: { $sum: 1 },
            },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 20 },
    ])
    .toArray();

printjson({
    migration: "chat-read-state-v2-verify",
    remaining,
    incompleteV2,
    malformedV2,
    duplicateReadStateKeys: duplicateReadStates,
    duplicateTopicReadStateKeys: duplicateTopicReadStates,
});

if (
    remaining > 0 ||
    incompleteV2 > 0 ||
    malformedV2 > 0 ||
    duplicateReadStates.length > 0 ||
    duplicateTopicReadStates.length > 0
) {
    quit(1);
}

db.chatTopicReadStates.createIndex({ userDid: 1, conversationId: 1, topicId: 1 }, { unique: true });
const requiredIndex = db.chatTopicReadStates
    .getIndexes()
    .find((index) => index.key?.userDid === 1 && index.key?.conversationId === 1 && index.key?.topicId === 1);
if (!requiredIndex || requiredIndex.unique !== true) {
    printjson({ error: "required unique chatTopicReadStates index is missing or non-unique", requiredIndex });
    quit(1);
}
printjson({ requiredTopicReadStateIndex: requiredIndex.name, unique: requiredIndex.unique });
db.schemaMigrations.updateOne(
    { _id: "chat-read-state-v2" },
    {
        $set: { status: "complete", verifiedAt: new Date() },
        $setOnInsert: { completedAt: new Date() },
    },
    { upsert: true },
);
printjson({ migrationMarker: "chat-read-state-v2", status: "complete" });
