import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";

const databaseName = process.env.CIRCLES_MONGODB_DATABASE || "";
const mongoUri = process.env.MONGODB_URI || "";
if (process.env.NODE_ENV !== "test") throw new Error("Refusing Mongo regression test outside NODE_ENV=test");
if (!/^circles_stage1a_test_[a-z0-9_-]+$/i.test(databaseName)) throw new Error("Refusing non-disposable database");
const mongoUrl = new URL(mongoUri);
if (!["127.0.0.1", "localhost"].includes(mongoUrl.hostname)) throw new Error("Refusing non-local MongoDB");
if (!["27028", "27029"].includes(mongoUrl.port)) throw new Error("Refusing non-disposable MongoDB port");

async function main() {
    const dbModule = await import("@/lib/data/db");
    const { resolveCanonicalDm } = await import("./canonical-dm");
    const { discardDmDraftRecord, publishDmFirstTopic, reconcilePublishedDmDraft, saveDmDraftRecord } = await import(
        "./dm-draft-persistence"
    );
    const { processFirstTopicNotifications } = await import("./first-topic-notifications");
    const {
        CanonicalDmClaims,
        ChatConversations,
        ChatMessageDocs,
        ChatTopicDrafts,
        Circles,
        Notifications,
        db,
        ensureRequiredChatIndexes,
    } = dbModule;

    try {
        await db.dropDatabase();
        const draft = (generation: string) => ({
            authorDid: "did:index",
            recipientDid: "did:duplicate",
            title: generation,
            body: "",
            hashtags: [],
            entryKind: "composer" as const,
            revision: 1,
            generation,
            state: "active" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await ChatTopicDrafts.insertMany([draft("a"), draft("b")]);
        await assert.rejects(ensureRequiredChatIndexes(), /conflicting records/);
        assert.equal(await ChatTopicDrafts.countDocuments({ authorDid: "did:index" }), 2);
        await ChatTopicDrafts.deleteMany({});
        await ensureRequiredChatIndexes();

        const proposed = new ObjectId();
        const sameClaims = await Promise.all([
            resolveCanonicalDm("did:a", "did:b", { proposedConversationId: proposed, firstSubmissionId: "same" }),
            resolveCanonicalDm("did:b", "did:a", { proposedConversationId: proposed, firstSubmissionId: "same" }),
        ]);
        assert.equal(sameClaims[0]._id.toString(), sameClaims[1]._id.toString());
        const differentClaims = await Promise.all([
            resolveCanonicalDm("did:c", "did:d", { proposedConversationId: new ObjectId(), firstSubmissionId: "one" }),
            resolveCanonicalDm("did:d", "did:c", { proposedConversationId: new ObjectId(), firstSubmissionId: "two" }),
        ]);
        assert.equal(differentClaims[0]._id.toString(), differentClaims[1]._id.toString());
        assert.equal(
            await ChatConversations.countDocuments({
                type: "dm",
                participants: { $all: ["did:c", "did:d"], $size: 2 },
            }),
            1,
        );

        const interruptedId = new ObjectId();
        await CanonicalDmClaims.insertOne({
            pairKey: "did:interrupted-a\u0000did:interrupted-b",
            participants: ["did:interrupted-a", "did:interrupted-b"],
            conversationId: interruptedId.toString(),
            firstSubmissionId: "interrupted",
            state: "creating",
            createdAt: new Date(),
        });
        const recovered = await resolveCanonicalDm("did:interrupted-a", "did:interrupted-b");
        assert.equal(recovered._id.toString(), interruptedId.toString());
        assert.equal((await CanonicalDmClaims.findOne({ conversationId: interruptedId.toString() }))?.state, "ready");

        const corruptId = new ObjectId();
        await CanonicalDmClaims.insertOne({
            pairKey: "did:corrupt-a\u0000did:corrupt-b",
            participants: ["did:corrupt-a", "did:corrupt-b"],
            conversationId: corruptId.toString(),
            firstSubmissionId: "corrupt",
            state: "ready",
            createdAt: new Date(),
        });
        await assert.rejects(resolveCanonicalDm("did:corrupt-a", "did:corrupt-b"), /missing or corrupt/);
        const archivedId = new ObjectId();
        await ChatConversations.insertOne({
            _id: archivedId,
            type: "dm",
            participants: ["did:archived-a", "did:archived-b"],
            archived: true,
            createdAt: new Date(),
        });
        await CanonicalDmClaims.insertOne({
            pairKey: "did:archived-a\u0000did:archived-b",
            participants: ["did:archived-a", "did:archived-b"],
            conversationId: archivedId.toString(),
            firstSubmissionId: "archived",
            state: "ready",
            createdAt: new Date(),
        });
        await assert.rejects(resolveCanonicalDm("did:archived-a", "did:archived-b"), /archived/);
        await ChatConversations.insertMany([
            { type: "dm", participants: ["did:history-a", "did:history-b"], createdAt: new Date() },
            { type: "dm", participants: ["did:history-a", "did:history-b"], createdAt: new Date() },
        ]);
        await assert.rejects(resolveCanonicalDm("did:history-a", "did:history-b"), /Multiple direct-message/);

        const generation = "generation-race";
        const draftInput = {
            authorDid: "did:drafter",
            recipientDid: "did:target",
            title: "Draft",
            body: "body",
            hashtags: [],
            entryKind: "composer" as const,
            revision: 1,
            generation,
        };
        await saveDmDraftRecord(draftInput);
        await Promise.all([
            discardDmDraftRecord("did:drafter", "did:target", generation),
            saveDmDraftRecord({ ...draftInput, body: "delayed", revision: 2 }),
        ]);
        assert.equal((await ChatTopicDrafts.findOne({ generation }))?.state, "discarded");
        assert.deepEqual(await saveDmDraftRecord({ ...draftInput, revision: 3 }), { saved: false, stale: true });

        await Circles.insertMany([
            { _id: new ObjectId(), did: "did:sender", name: "Sender", handle: "sender", circleType: "user" },
            { _id: new ObjectId(), did: "did:receiver", name: "Receiver", handle: "receiver", circleType: "user" },
        ] as any[]);
        await saveDmDraftRecord({
            authorDid: "did:sender",
            recipientDid: "did:receiver",
            title: "Hello",
            body: "hello",
            hashtags: [],
            entryKind: "composer",
            revision: 1,
            generation: "published-generation",
        });
        const publication = await publishDmFirstTopic({
            authorDid: "did:sender",
            recipientDid: "did:receiver",
            title: "Hello",
            body: "hello",
            hashtags: [],
            generation: "published-generation",
            submissionId: "0123456789abcdef01234567",
            processNotifications: false,
        });
        const topic = await ChatMessageDocs.findOne({ _id: new ObjectId(publication.topicId) });
        const conversation = await ChatConversations.findOne({ _id: new ObjectId(publication.conversationId) });
        assert.equal(conversation?.metadata?.dmProvisional, undefined);
        assert.equal(conversation?.updatedAt?.getTime(), topic?.createdAt.getTime());
        assert.equal((await ChatTopicDrafts.findOne({ generation: "published-generation" }))?.state, "consumed");
        await ChatTopicDrafts.updateOne(
            { authorDid: "did:sender", recipientDid: "did:receiver" },
            { $set: { generation: "published-generation", state: "active", revision: 2, updatedAt: new Date() } },
        );
        assert.equal(await reconcilePublishedDmDraft("did:sender", "did:receiver", "published-generation"), true);
        assert.equal((await ChatTopicDrafts.findOne({ generation: "published-generation" }))?.state, "consumed");

        assert.equal(await Notifications.countDocuments({}), 0);
        assert.equal((await processFirstTopicNotifications(1, publication.topicId)).delivered, 1);
        assert.equal(await Notifications.countDocuments({ userId: "did:receiver", type: "pm_received" }), 1);
        await Notifications.updateOne({ userId: "did:receiver", type: "pm_received" }, { $set: { isRead: true } });
        await ChatMessageDocs.updateOne(
            { _id: new ObjectId(publication.topicId) },
            {
                $set: { "firstTopicNotification.state": "pending" },
                $unset: { "firstTopicNotification.deliveredAt": "" },
            },
        );
        await processFirstTopicNotifications(1, publication.topicId);
        assert.equal(await Notifications.countDocuments({ userId: "did:receiver", type: "pm_received" }), 1);
        assert.equal((await Notifications.findOne({ userId: "did:receiver", type: "pm_received" }))?.isRead, true);

        await Circles.insertMany([
            {
                _id: new ObjectId(),
                did: "did:mention-sender",
                name: "MS",
                handle: "mention-sender",
                circleType: "user",
            },
            {
                _id: new ObjectId(),
                did: "did:mention-receiver",
                name: "MR",
                handle: "mention-receiver",
                circleType: "user",
            },
        ] as any[]);
        const mention = await publishDmFirstTopic({
            authorDid: "did:mention-sender",
            recipientDid: "did:mention-receiver",
            title: "Mention",
            body: "Hello [Receiver](/circles/mention-receiver)",
            hashtags: [],
            generation: "mention-generation",
            submissionId: "1123456789abcdef01234567",
            processNotifications: false,
        });
        await Promise.all([
            processFirstTopicNotifications(1, mention.topicId),
            processFirstTopicNotifications(1, mention.topicId),
        ]);
        assert.equal(await Notifications.countDocuments({ userId: "did:mention-receiver", type: "chat_mention" }), 1);
        assert.equal(await Notifications.countDocuments({ userId: "did:mention-receiver", type: "pm_received" }), 0);
        await ChatMessageDocs.updateOne(
            { _id: new ObjectId(mention.topicId) },
            {
                $set: {
                    "firstTopicNotification.state": "processing",
                    "firstTopicNotification.leaseUntil": new Date(0),
                },
            },
        );
        await Promise.all([
            processFirstTopicNotifications(1, mention.topicId),
            processFirstTopicNotifications(1, mention.topicId),
        ]);
        assert.equal(await Notifications.countDocuments({ userId: "did:mention-receiver", type: "chat_mention" }), 1);
        assert.equal(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(mention.topicId) }))?.firstTopicNotification?.state,
            "delivered",
        );

        const invalidTopicId = new ObjectId();
        await ChatMessageDocs.insertOne({
            _id: invalidTopicId,
            conversationId: new ObjectId().toString(),
            senderDid: "did:sender",
            body: "invalid",
            createdAt: new Date(),
            thread: { title: "Invalid", createdAt: new Date(), updatedAt: new Date(), replyCount: 0 },
            firstTopicNotification: { state: "pending", attempts: 0 },
        });
        assert.equal((await processFirstTopicNotifications(1, invalidTopicId.toString())).failed, 1);
        const failed = await ChatMessageDocs.findOne({ _id: invalidTopicId });
        assert.equal(failed?.firstTopicNotification?.state, "pending");
        assert.ok(failed?.firstTopicNotification?.retryAfter! > new Date());
        await processFirstTopicNotifications(1, invalidTopicId.toString());
        assert.equal((await ChatMessageDocs.findOne({ _id: invalidTopicId }))?.firstTopicNotification?.attempts, 1);

        const publish = (submissionId: string, generation: string) =>
            publishDmFirstTopic({
                authorDid: "did:submit-a",
                recipientDid: "did:submit-b",
                title: generation,
                body: generation,
                hashtags: [],
                generation,
                submissionId,
                processNotifications: false,
            });
        const sameSubmission = await Promise.all([
            publish("2123456789abcdef01234567", "same-generation"),
            publish("2123456789abcdef01234567", "same-generation"),
        ]);
        assert.equal(sameSubmission[0].topicId, sameSubmission[1].topicId);
        const differentSubmissions = await Promise.all([
            publish("3123456789abcdef01234567", "generation-one"),
            publish("4123456789abcdef01234567", "generation-two"),
        ]);
        assert.equal(differentSubmissions[0].conversationId, differentSubmissions[1].conversationId);
        assert.equal(await ChatMessageDocs.countDocuments({ senderDid: "did:submit-a" }), 3);

        const inviteSource = readFileSync(
            new URL("../../components/modules/home/engagement-card.tsx", import.meta.url),
            "utf8",
        );
        assert.doesNotMatch(inviteSource, /findOrCreateDMRoom/);
        const phantom = await resolveCanonicalDm("did:invite", "did:recipient", { provisional: true });
        assert.equal(
            await ChatConversations.countDocuments({ _id: phantom._id, "metadata.dmProvisional": { $ne: true } }),
            0,
        );

        console.log("Messaging Stage 1A Mongo regression tests passed (production persistence helpers)");
    } finally {
        await db.dropDatabase();
        await dbModule.client.close();
    }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
