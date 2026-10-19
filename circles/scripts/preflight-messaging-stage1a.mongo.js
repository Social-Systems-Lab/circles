// Messaging Stage 1A production preflight. This file is intentionally read-only.
// It may use only diagnostic commands and collection/index reads.

const failures = [];
const warnings = [];
const checks = [];

const fail = (check, detail) => failures.push({ check, detail });
const warn = (check, detail) => warnings.push({ check, detail });
const pass = (check, detail) => checks.push({ check, detail });
const stable = (value) => EJSON.stringify(value, { relaxed: false });
const same = (left, right) => stable(left) === stable(right);
const objectIdPattern = /^[0-9a-f]{24}$/i;

const expectedIndexes = [
    { collection: "chatConversations", key: { participants: 1, type: 1, archived: 1, updatedAt: -1 } },
    { collection: "chatConversations", key: { circleId: 1, type: 1, archived: 1 } },
    { collection: "chatRoomMembers", key: { userDid: 1, chatRoomId: 1 } },
    { collection: "chatRoomMembers", key: { chatRoomId: 1 } },
    { collection: "chatMessageDocs", key: { conversationId: 1, _id: 1 } },
    { collection: "chatMessageDocs", key: { conversationId: 1, threadId: 1, _id: 1 } },
    { collection: "chatReadStates", key: { userDid: 1, conversationId: 1 } },
    {
        collection: "chatTopicReadStates",
        key: { userDid: 1, conversationId: 1, topicId: 1 },
        unique: true,
    },
    { collection: "chatTopicDrafts", key: { authorDid: 1, recipientDid: 1 }, unique: true },
    { collection: "chatTopicDrafts", key: { authorDid: 1, state: 1, updatedAt: -1 } },
    {
        collection: "chatTopicDraftTombstones",
        key: { authorDid: 1, recipientDid: 1, generation: 1 },
        unique: true,
    },
    { collection: "canonicalDmClaims", key: { pairKey: 1 }, unique: true },
    {
        collection: "chatMessageDocs",
        key: { senderDid: 1, submissionId: 1 },
        unique: true,
        partialFilterExpression: { submissionId: { $type: "string" } },
    },
    {
        collection: "chatMessageDocs",
        key: { "firstTopicNotification.state": 1, "firstTopicNotification.leaseUntil": 1 },
    },
].map((index) => ({
    ...index,
    name: Object.entries(index.key)
        .map(([field, direction]) => `${field}_${direction}`)
        .join("_"),
}));

const duplicateSpecs = [
    {
        collection: "chatTopicReadStates",
        id: { userDid: "$userDid", conversationId: "$conversationId", topicId: "$topicId" },
    },
    { collection: "chatTopicDrafts", id: { authorDid: "$authorDid", recipientDid: "$recipientDid" } },
    {
        collection: "chatTopicDraftTombstones",
        id: { authorDid: "$authorDid", recipientDid: "$recipientDid", generation: "$generation" },
    },
    { collection: "canonicalDmClaims", id: "$pairKey" },
    {
        collection: "chatMessageDocs",
        match: { submissionId: { $type: "string" } },
        id: { senderDid: "$senderDid", submissionId: "$submissionId" },
    },
];

for (const spec of duplicateSpecs) {
    const pipeline = [];
    if (spec.match) pipeline.push({ $match: spec.match });
    pipeline.push({ $group: { _id: spec.id, count: { $sum: 1 }, recordIds: { $push: "$_id" } } });
    pipeline.push({ $match: { count: { $gt: 1 } } });
    const duplicates = db.getCollection(spec.collection).aggregate(pipeline, { allowDiskUse: false }).toArray();
    if (duplicates.length) fail(`duplicates:${spec.collection}`, duplicates);
    else pass(`duplicates:${spec.collection}`, "none");
}

const privilegeResult = db.runCommand({ connectionStatus: 1, showPrivileges: true });
if (privilegeResult.ok !== 1) {
    fail("permissions", `connectionStatus failed: ${privilegeResult.errmsg || "unknown error"}`);
} else {
    const privileges = privilegeResult.authInfo?.authenticatedUserPrivileges;
    if (!Array.isArray(privileges)) {
        fail("permissions", "MongoDB did not advertise authenticated privileges");
    } else {
        const requiredCollections = [...new Set(expectedIndexes.map((index) => index.collection))];
        const permits = (collection, action) =>
            privileges.some((privilege) => {
                const resource = privilege.resource || {};
                const resourceMatches =
                    resource.anyResource === true ||
                    (resource.db === "" && resource.collection === "") ||
                    (resource.db === db.getName() && (resource.collection === "" || resource.collection === collection));
                return resourceMatches && Array.isArray(privilege.actions) && privilege.actions.includes(action);
            });
        for (const collection of requiredCollections) {
            for (const action of ["find", "listIndexes", "createIndex"]) {
                if (!permits(collection, action)) fail("permissions", `${action} is not advertised for ${collection}`);
            }
        }
        if (!failures.some((entry) => entry.check === "permissions")) {
            pass("permissions", "find/aggregate, listIndexes, and createIndex are advertised for required collections");
        }
    }
}

const indexesByCollection = new Map();
for (const collection of [...new Set(expectedIndexes.map((index) => index.collection))]) {
    try {
        indexesByCollection.set(collection, db.getCollection(collection).getIndexes());
    } catch (error) {
        if (error.code === 26 || error.codeName === "NamespaceNotFound") indexesByCollection.set(collection, []);
        else fail(`indexes:${collection}`, `could not list indexes: ${error.codeName || error.message}`);
    }
}

for (const expected of expectedIndexes) {
    const indexes = indexesByCollection.get(expected.collection) || [];
    const expectedOptions = {
        unique: expected.unique === true,
        partialFilterExpression: expected.partialFilterExpression,
    };
    const optionMatches = (actual) =>
        (actual.unique === true) === expectedOptions.unique &&
        same(actual.partialFilterExpression, expectedOptions.partialFilterExpression) &&
        actual.sparse !== true &&
        actual.collation === undefined &&
        actual.expireAfterSeconds === undefined &&
        actual.wildcardProjection === undefined;
    const exact = indexes.find((actual) => same(actual.key, expected.key) && optionMatches(actual));
    const requiredNameIndex = indexes.find((actual) => actual.name === expected.name);
    const nameConflict = requiredNameIndex && (!same(requiredNameIndex.key, expected.key) || !optionMatches(requiredNameIndex));
    const customKeyVariants = indexes.filter(
        (actual) => actual.name !== expected.name && same(actual.key, expected.key) && !optionMatches(actual),
    );
    if (nameConflict) {
        fail(`index:${expected.collection}.${expected.name}`, {
            reason: "required default name is occupied by an incompatible index",
            actualKey: requiredNameIndex.key,
            expectedOptions,
            actualOptions: {
                unique: requiredNameIndex.unique === true,
                partialFilterExpression: requiredNameIndex.partialFilterExpression,
            },
        });
    }
    if (exact) pass(`index:${expected.collection}.${expected.name}`, `compatible (${exact.name})`);
    else if (!nameConflict) {
        if (customKeyVariants.length) {
            warn(`index:${expected.collection}.${expected.name}`, {
                detail: "custom-named same-key index variants can coexist; required index is absent and can be created at startup",
                existingNames: customKeyVariants.map((index) => index.name),
            });
        }
        pass(`index:${expected.collection}.${expected.name}`, "absent; can be created at startup");
    }
}

const dmById = new Map();
const activeDmIdsByPair = new Map();
for (const conversation of db.chatConversations.find({ type: "dm" }).toArray()) {
    const id = conversation._id.toString();
    dmById.set(id, conversation);
    if (conversation.archived === true) continue;
    const participants = conversation.participants;
    if (
        Array.isArray(participants) &&
        participants.length === 1 &&
        typeof participants[0] === "string" &&
        participants[0].length > 0
    ) {
        continue;
    }
    if (
        !Array.isArray(participants) ||
        participants.length !== 2 ||
        participants.some((did) => typeof did !== "string" || did.length === 0) ||
        participants[0] === participants[1]
    ) {
        fail("canonical-dm-history", { conversationId: id, reason: "active DM has malformed participants" });
        continue;
    }
    const pairKey = participants.slice().sort().join("\u0000");
    const ids = activeDmIdsByPair.get(pairKey) || [];
    ids.push(id);
    activeDmIdsByPair.set(pairKey, ids);
}
for (const [pairKey, conversationIds] of activeDmIdsByPair) {
    if (conversationIds.length > 1) fail("canonical-dm-history", { pairKey, conversationIds, reason: "multiple active DMs" });
}

for (const claim of db.canonicalDmClaims.find({}).toArray()) {
    const claimId = claim._id.toString();
    const detail = (reason) => ({ claimId, conversationId: claim.conversationId, pairKey: claim.pairKey, reason });
    if (
        !Array.isArray(claim.participants) ||
        claim.participants.length !== 2 ||
        claim.participants.some((did) => typeof did !== "string" || did.length === 0) ||
        claim.participants[0] === claim.participants[1]
    ) {
        fail("canonical-dm-claim", detail("malformed participants"));
        continue;
    }
    const participants = claim.participants.slice().sort();
    const pairKey = participants.join("\u0000");
    if (!same(claim.participants, participants)) warn("canonical-dm-claim", detail("participants are valid but not normalized"));
    if (claim.pairKey !== pairKey) fail("canonical-dm-claim", detail("pairKey does not match participants"));
    if (typeof claim.conversationId !== "string" || !objectIdPattern.test(claim.conversationId)) {
        fail("canonical-dm-claim", detail("invalid conversationId"));
        continue;
    }
    if (!["creating", "ready"].includes(claim.state)) fail("canonical-dm-claim", detail("unsupported state"));
    const activeIds = activeDmIdsByPair.get(pairKey) || [];
    const target = dmById.get(claim.conversationId);
    if (!target) {
        const anyTarget = db.chatConversations.findOne({ _id: ObjectId.createFromHexString(claim.conversationId) });
        if (!anyTarget && claim.state === "creating" && activeIds.length === 0) {
            warn("canonical-dm-claim", detail("creating claim target is missing but recoverable"));
        } else if (!anyTarget && claim.state === "creating") {
            fail("canonical-dm-claim", {
                ...detail("creating claim target is missing and conflicts with active DM history"),
                activeConversationIds: activeIds,
            });
        } else {
            fail("canonical-dm-claim", detail(anyTarget ? "target is not a DM" : "target is missing"));
        }
        continue;
    }
    if (target.archived === true) fail("canonical-dm-claim", detail("target is archived"));
    const targetParticipants = Array.isArray(target.participants) ? target.participants.slice().sort() : [];
    if (!same(targetParticipants, participants)) fail("canonical-dm-claim", detail("target participants are inconsistent"));
    if (activeIds.length === 1 && activeIds[0] !== claim.conversationId) {
        fail("canonical-dm-claim", { ...detail("claim conflicts with active DM history"), activeConversationId: activeIds[0] });
    }
    if (claim.state === "creating") warn("canonical-dm-claim", detail("claim is still creating"));
}

if (!failures.some((entry) => entry.check.startsWith("canonical-dm"))) pass("canonical-dm", "claims and active history are consistent");

printjson({
    preflight: "messaging-stage1a",
    database: db.getName(),
    ok: failures.length === 0,
    checks,
    warnings,
    failures,
});
quit(failures.length === 0 ? 0 : 1);
