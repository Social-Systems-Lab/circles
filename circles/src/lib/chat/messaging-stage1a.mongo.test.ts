import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ObjectId } from "mongodb";

const databaseName = process.env.CIRCLES_MONGODB_DATABASE || "";
const mongoUri = process.env.MONGODB_URI || "";
if (process.env.NODE_ENV !== "test") throw new Error("Refusing Mongo regression test outside NODE_ENV=test");
if (!/^circles_stage1a_test_[a-z0-9_-]+$/i.test(databaseName)) throw new Error("Refusing non-disposable database");
const mongoUrl = new URL(mongoUri);
if (!["127.0.0.1", "localhost"].includes(mongoUrl.hostname)) throw new Error("Refusing non-local MongoDB");
if (!["27028", "27029"].includes(mongoUrl.port)) throw new Error("Refusing non-disposable MongoDB port");

async function main() {
    process.env.CIRCLES_JWT_SECRET ||= "stage1a-mongo-regression-test-secret";

    const require = createRequire(import.meta.url);
    const nextHeaders = require("next/headers") as typeof import("next/headers");
    const productionCookies = nextHeaders.cookies;
    let authenticatedRequestToken: string | undefined;
    nextHeaders.cookies = async () =>
        ({
            get: (name: string) =>
                name === AUTH_COOKIE_NAME && authenticatedRequestToken
                    ? { name, value: authenticatedRequestToken }
                    : undefined,
        }) as Awaited<ReturnType<typeof nextHeaders.cookies>>;
    const { AUTH_COOKIE_NAME } = await import("@/lib/auth/cookie");
    const { generateUserToken } = await import("@/lib/auth/jwt");
    const dbModule = await import("@/lib/data/db");
    const { resolveCanonicalDm } = await import("./canonical-dm");
    const { runWithChatActionContext } = await import("./chat-action-context");
    const mongoActions = await import("@/components/modules/chat/mongo-actions");
    const {
        createMessage,
        createThread,
        createThreadReply,
        fetchMessagesSince,
        getLegacyUnreadCountForUser,
        getTopicUnreadCountsForUser,
        listConversationCandidatesForUser,
        mapConversationToChatRoomDisplay,
        markConversationRead,
        markTopicRead,
    } = await import("@/lib/data/mongo-chat");
    const { discardDmDraftRecord, publishDmFirstTopic, reconcilePublishedDmDraft, saveDmDraftRecord } = await import(
        "./dm-draft-persistence"
    );
    const { processFirstTopicNotifications } = await import("./first-topic-notifications");
    const {
        CanonicalDmClaims,
        ChatConversations,
        ChatMessageDocs,
        ChatReadStates,
        ChatTopicReadStates,
        ChatTopicDrafts,
        Circles,
        Notifications,
        db,
        ensureRequiredChatIndexes,
    } = dbModule;
    const runWithAuthenticatedRequest = async <T>(viewerDid: string, callback: () => Promise<T>): Promise<T> => {
        authenticatedRequestToken = await generateUserToken(viewerDid);
        try {
            return await callback();
        } finally {
            authenticatedRequestToken = undefined;
        }
    };

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
        const pmNotification = await Notifications.findOne({ userId: "did:receiver", type: "pm_received" });
        assert.equal(pmNotification?.content?.topicId, publication.topicId);
        assert.equal(pmNotification?.content?.url, `/chat/${publication.conversationId}?topic=${publication.topicId}`);
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
        const mentionNotification = await Notifications.findOne({
            userId: "did:mention-receiver",
            type: "chat_mention",
        });
        assert.equal(mentionNotification?.content?.body, "MS mentioned you in “Mention”");
        assert.equal(mentionNotification?.content?.topicTitle, "Mention");
        assert.equal(mentionNotification?.content?.roomId, mention.conversationId);
        assert.equal(mentionNotification?.content?.topicId, mention.topicId);
        assert.equal(mentionNotification?.content?.url, `/chat/${mention.conversationId}?topic=${mention.topicId}`);
        await Notifications.deleteMany({ userId: "did:mention-receiver", type: "chat_mention" });
        const mentionConversation = await ChatConversations.findOne({ _id: new ObjectId(mention.conversationId) });
        await runWithAuthenticatedRequest("did:mention-sender", () =>
            runWithChatActionContext({ viewerDid: "did:mention-sender" }, () =>
                mongoActions.sendConversationMessageNotifications({
                    conversationId: mention.conversationId,
                    conversation: mentionConversation,
                    senderDid: "did:mention-sender",
                    messageBody: "Reply for [Receiver](/circles/mention-receiver)",
                    messageId: new ObjectId().toString(),
                    topicId: mention.topicId,
                }),
            ),
        );
        const replyMentionNotification = await Notifications.findOne({
            userId: "did:mention-receiver",
            type: "chat_mention",
        });
        assert.equal(replyMentionNotification?.content?.body, "MS mentioned you in “Mention”");
        assert.equal(replyMentionNotification?.content?.topicTitle, "Mention");
        assert.equal(replyMentionNotification?.content?.roomId, mention.conversationId);
        assert.equal(replyMentionNotification?.content?.topicId, mention.topicId);
        assert.equal(
            replyMentionNotification?.content?.url,
            `/chat/${mention.conversationId}?topic=${mention.topicId}`,
        );
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
        assert.equal(
            await Notifications.countDocuments({ userId: "did:mention-receiver", type: "chat_mention" }),
            2,
            "the reply mention and reprocessed first-topic mention are distinct notification events",
        );
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

        const archiveConversationId = new ObjectId();
        const archiveUpdatedAt = new Date("2026-01-02T03:04:05.000Z");
        await ChatConversations.insertOne({
            _id: archiveConversationId,
            type: "dm",
            participants: ["did:archive-alice", "did:archive-bob"],
            createdAt: archiveUpdatedAt,
            updatedAt: archiveUpdatedAt,
        });
        await ChatMessageDocs.insertOne({
            conversationId: archiveConversationId.toString(),
            senderDid: "did:archive-alice",
            body: "history",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            attachments: [{ url: "/storage/history.png", name: "history.png" }],
        });
        await ChatReadStates.insertOne({
            conversationId: archiveConversationId.toString(),
            userDid: "did:archive-alice",
            lastReadMessageId: null,
            updatedAt: archiveUpdatedAt,
        });
        await ChatTopicReadStates.insertOne({
            conversationId: archiveConversationId.toString(),
            topicId: new ObjectId().toString(),
            userDid: "did:archive-alice",
            lastReadMessageId: null,
            updatedAt: archiveUpdatedAt,
        });
        await ChatTopicDrafts.insertOne({
            authorDid: "did:archive-alice",
            recipientDid: "did:archive-bob",
            title: "Preserved draft",
            body: "draft",
            hashtags: [],
            entryKind: "composer",
            revision: 1,
            generation: "archive-preserved-draft",
            state: "active",
            createdAt: archiveUpdatedAt,
            updatedAt: archiveUpdatedAt,
        });
        const preservedNotificationCount = await Notifications.countDocuments({});
        const preservedClaimCount = await CanonicalDmClaims.countDocuments({});

        await runWithChatActionContext({ viewerDid: "did:archive-alice" }, async () => {
            assert.equal(
                (await mongoActions.archiveDmConversationAction(archiveConversationId.toString())).success,
                true,
            );
            assert.equal(
                (await mongoActions.archiveDmConversationAction(archiveConversationId.toString())).success,
                true,
            );
        });
        let archivedConversation = await ChatConversations.findOne({ _id: archiveConversationId });
        assert.deepEqual(archivedConversation?.archivedBy, ["did:archive-alice"]);
        const clientRoom = await mapConversationToChatRoomDisplay("did:archive-alice", archivedConversation as any);
        assert.equal(Object.prototype.hasOwnProperty.call(clientRoom || {}, "archivedBy"), false);
        assert.equal(archivedConversation?.updatedAt?.getTime(), archiveUpdatedAt.getTime());
        assert.equal((await listConversationCandidatesForUser("did:archive-alice", [], "active")).length, 0);
        assert.equal((await listConversationCandidatesForUser("did:archive-alice", [], "archived")).length, 1);
        assert.equal((await listConversationCandidatesForUser("did:archive-bob", [], "active")).length, 1);
        assert.equal((await listConversationCandidatesForUser("did:archive-bob", [], "archived")).length, 0);
        await runWithChatActionContext({ viewerDid: "did:outsider" }, async () => {
            assert.equal(
                (await mongoActions.archiveDmConversationAction(archiveConversationId.toString())).success,
                false,
            );
            assert.equal(
                (await mongoActions.unarchiveDmConversationAction(archiveConversationId.toString())).success,
                false,
            );
        });
        await runWithChatActionContext({ viewerDid: "did:archive-alice" }, async () => {
            assert.equal(
                (await mongoActions.unarchiveDmConversationAction(archiveConversationId.toString())).success,
                true,
            );
            assert.equal(
                (await mongoActions.unarchiveDmConversationAction(archiveConversationId.toString())).success,
                true,
            );
        });
        archivedConversation = await ChatConversations.findOne({ _id: archiveConversationId });
        assert.deepEqual(archivedConversation?.archivedBy, []);
        assert.equal(archivedConversation?.updatedAt?.getTime(), archiveUpdatedAt.getTime());
        assert.equal(await ChatMessageDocs.countDocuments({ conversationId: archiveConversationId.toString() }), 1);
        assert.equal(await ChatReadStates.countDocuments({ conversationId: archiveConversationId.toString() }), 1);
        assert.equal(await ChatTopicReadStates.countDocuments({ conversationId: archiveConversationId.toString() }), 1);
        assert.equal(await ChatTopicDrafts.countDocuments({ generation: "archive-preserved-draft" }), 1);
        assert.equal(await Notifications.countDocuments({}), preservedNotificationCount);
        assert.equal(await CanonicalDmClaims.countDocuments({}), preservedClaimCount);

        await Circles.insertOne({
            _id: new ObjectId(),
            did: "did:attachment-cleanup",
            circleType: "user",
        } as any);
        const cleanupConversationId = new ObjectId();
        await ChatConversations.insertOne({
            _id: cleanupConversationId,
            type: "dm",
            participants: ["did:attachment-cleanup", "did:attachment-recipient"],
            createdAt: new Date(),
        });
        const deletedUploads: string[] = [];
        const attachmentForm = new FormData();
        attachmentForm.set("roomId", cleanupConversationId.toString());
        attachmentForm.set("file", new File(["content"], "cleanup.txt", { type: "text/plain" }));
        const attachmentResult = await runWithChatActionContext(
            {
                viewerDid: "did:attachment-cleanup",
                findConversation: async () => ChatConversations.findOne({ _id: cleanupConversationId }),
                findMessagingUser: async () => ({
                    did: "did:attachment-cleanup",
                    circleType: "user",
                    picture: { url: "/cleanup.png" },
                    description: "complete",
                    isAdmin: true,
                    isEmailVerified: true,
                }),
                saveFile: async () => ({
                    url: "/storage/cleanup/rejected.txt",
                    fileName: "rejected.txt",
                    originalName: "cleanup.txt",
                }),
                createMessage: async () => {
                    throw new Error("simulated persistence failure");
                },
                deleteFile: async (url) => {
                    deletedUploads.push(url);
                },
            },
            () => mongoActions.sendMongoAttachmentAction(attachmentForm),
        );
        assert.equal(attachmentResult.success, false);
        assert.deepEqual(deletedUploads, ["/storage/cleanup/rejected.txt"]);
        assert.equal(await ChatMessageDocs.countDocuments({ conversationId: cleanupConversationId.toString() }), 0);

        await ChatConversations.updateOne(
            { _id: archiveConversationId },
            { $set: { archivedBy: ["did:archive-bob"] } },
        );
        await createMessage({
            conversationId: archiveConversationId.toString(),
            senderDid: "did:archive-alice",
            body: "ordinary",
            createdAt: new Date(),
        });
        assert.deepEqual((await ChatConversations.findOne({ _id: archiveConversationId }))?.archivedBy, []);

        await createMessage({
            conversationId: archiveConversationId.toString(),
            senderDid: "did:archive-alice",
            body: "incoming before manual archive",
            createdAt: new Date(),
        });
        await runWithChatActionContext({ viewerDid: "did:archive-bob" }, async () => {
            assert.equal(
                (await mongoActions.archiveDmConversationAction(archiveConversationId.toString())).success,
                true,
            );
        });
        assert.deepEqual((await ChatConversations.findOne({ _id: archiveConversationId }))?.archivedBy, [
            "did:archive-bob",
        ]);

        await ChatConversations.updateOne(
            { _id: archiveConversationId },
            { $addToSet: { archivedBy: "did:archive-bob" } },
        );
        await createMessage({
            conversationId: archiveConversationId.toString(),
            senderDid: "did:archive-alice",
            body: "attachment",
            createdAt: new Date(),
            attachments: [{ url: "/storage/new.png", name: "new.png" }],
        });
        assert.deepEqual((await ChatConversations.findOne({ _id: archiveConversationId }))?.archivedBy, []);

        await ChatConversations.updateOne(
            { _id: archiveConversationId },
            { $addToSet: { archivedBy: "did:archive-bob" } },
        );
        const archiveTopic = await createThread(
            archiveConversationId.toString(),
            "did:archive-alice",
            "Topic",
            "Body",
            [],
        );
        assert.ok(archiveTopic?._id);
        assert.deepEqual((await ChatConversations.findOne({ _id: archiveConversationId }))?.archivedBy, []);

        await ChatConversations.updateOne(
            { _id: archiveConversationId },
            { $addToSet: { archivedBy: "did:archive-bob" } },
        );
        await createThreadReply(String(archiveTopic!._id), archiveConversationId.toString(), "did:archive-alice", {
            body: "Reply",
            attachments: [{ url: "/storage/reply.png", name: "reply.png" }],
        });
        assert.deepEqual((await ChatConversations.findOne({ _id: archiveConversationId }))?.archivedBy, []);

        const firstTopic = await publishDmFirstTopic({
            authorDid: "did:first-topic-sender",
            recipientDid: "did:first-topic-recipient",
            title: "First",
            body: "First body",
            hashtags: [],
            generation: "archive-first-topic",
            submissionId: "5123456789abcdef01234567",
            processNotifications: false,
        });
        await ChatConversations.updateOne(
            { _id: new ObjectId(firstTopic.conversationId) },
            { $set: { archivedBy: ["did:first-topic-sender", "did:first-topic-recipient"] } },
        );
        await publishDmFirstTopic({
            authorDid: "did:first-topic-sender",
            recipientDid: "did:first-topic-recipient",
            title: "First",
            body: "First body",
            hashtags: [],
            generation: "archive-first-topic",
            submissionId: "5123456789abcdef01234567",
            processNotifications: false,
        });
        assert.deepEqual(
            (await ChatConversations.findOne({ _id: new ObjectId(firstTopic.conversationId) }))?.archivedBy,
            ["did:first-topic-sender"],
        );

        const singletonId = new ObjectId();
        await ChatConversations.insertOne({
            _id: singletonId,
            type: "dm",
            participants: ["did:welcome-user"],
            archivedBy: ["did:welcome-user"],
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await createMessage({
            conversationId: singletonId.toString(),
            senderDid: "system:kamooni",
            body: "Welcome",
            createdAt: new Date(),
        });
        assert.deepEqual((await ChatConversations.findOne({ _id: singletonId }))?.archivedBy, []);

        const globallyArchivedId = new ObjectId();
        const provisionalId = new ObjectId();
        await ChatConversations.insertMany([
            {
                _id: globallyArchivedId,
                type: "dm",
                participants: ["did:archive-alice", "did:global"],
                archived: true,
                archivedBy: ["did:archive-alice"],
                createdAt: new Date(),
            },
            {
                _id: provisionalId,
                type: "dm",
                participants: ["did:archive-alice", "did:provisional"],
                archivedBy: ["did:archive-alice"],
                metadata: { dmProvisional: true },
                createdAt: new Date(),
            },
        ]);
        const archivedCandidates = await listConversationCandidatesForUser("did:archive-alice", [], "archived");
        assert.equal(
            archivedCandidates.some((item) => item._id.toString() === globallyArchivedId.toString()),
            false,
        );
        assert.equal(
            archivedCandidates.some((item) => item._id.toString() === provisionalId.toString()),
            false,
        );

        const chronologicalConversationId = new ObjectId().toString();
        const highStarterId = new ObjectId("64afffffffffffffffffffff");
        const replyId = (offset: number) => new ObjectId(`64a00000000000000000${offset.toString(16).padStart(4, "0")}`);
        const chronologicalReplies = [
            ...Array.from({ length: 11 }, (_, index) => ({ senderDid: "did:chrono-p2", offset: index + 1 })),
            ...Array.from({ length: 6 }, (_, index) => ({ senderDid: "did:chrono-p1", offset: index + 100 })),
        ];
        await ChatMessageDocs.insertOne({
            _id: highStarterId,
            conversationId: chronologicalConversationId,
            senderDid: "did:chrono-p1",
            body: "fixture starter",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            thread: { title: "fixture", createdAt: new Date("2026-01-01T00:00:00.000Z"), replyCount: 17 },
        } as any);
        await ChatMessageDocs.insertMany(
            chronologicalReplies.map(({ senderDid, offset }, index) => ({
                _id: replyId(offset),
                conversationId: chronologicalConversationId,
                senderDid,
                body: "fixture reply",
                createdAt: new Date(Date.UTC(2026, 0, 2, 0, index)),
                threadId: highStarterId.toString(),
            })) as any[],
        );
        await ChatReadStates.insertMany([
            {
                userDid: "did:chrono-p1",
                conversationId: chronologicalConversationId,
                lastReadMessageId: null,
                legacyLastReadMessageId: highStarterId.toString(),
                topicFallbackMessageId: highStarterId.toString(),
                readStateVersion: 2,
                readStateMigratedAt: new Date(),
                updatedAt: new Date(),
            },
            {
                userDid: "did:chrono-p2",
                conversationId: chronologicalConversationId,
                lastReadMessageId: null,
                legacyLastReadMessageId: highStarterId.toString(),
                topicFallbackMessageId: highStarterId.toString(),
                readStateVersion: 2,
                readStateMigratedAt: new Date(),
                updatedAt: new Date(),
            },
        ] as any[]);
        assert.equal(
            (await getTopicUnreadCountsForUser("did:chrono-p1", chronologicalConversationId))[highStarterId.toString()],
            11,
        );
        assert.equal(
            (await getTopicUnreadCountsForUser("did:chrono-p2", chronologicalConversationId))[highStarterId.toString()],
            6,
        );
        assert.equal(
            (await fetchMessagesSince(chronologicalConversationId, highStarterId.toString(), 50)).length,
            17,
            "polling retrieves replies whose ObjectIds sort below the older starter",
        );
        const newestReplyId = replyId(11).toString();
        await Promise.all([
            markTopicRead("did:chrono-p1", chronologicalConversationId, highStarterId.toString(), newestReplyId),
            markTopicRead(
                "did:chrono-p1",
                chronologicalConversationId,
                highStarterId.toString(),
                highStarterId.toString(),
            ),
        ]);
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:chrono-p1",
                    conversationId: chronologicalConversationId,
                    topicId: highStarterId.toString(),
                })
            )?.lastReadMessageId,
            newestReplyId,
            "concurrent acknowledgement cannot move the topic cursor backward",
        );
        await ChatTopicReadStates.updateOne(
            {
                userDid: "did:chrono-p2",
                conversationId: chronologicalConversationId,
                topicId: highStarterId.toString(),
            },
            { $set: { lastReadMessageId: null } },
            { upsert: true },
        );
        assert.equal(
            (await getTopicUnreadCountsForUser("did:chrono-p2", chronologicalConversationId))[highStarterId.toString()],
            7,
            "an explicit-null topic cursor remains authoritative over the frozen fallback",
        );

        const legacyConversationId = new ObjectId().toString();
        const legacyOldHighId = new ObjectId("64bfffffffffffffffffffff");
        const legacyNewLowId = new ObjectId("64b000000000000000000001");
        await ChatMessageDocs.insertMany([
            {
                _id: legacyOldHighId,
                conversationId: legacyConversationId,
                senderDid: "did:legacy-self",
                body: "old fixture",
                createdAt: new Date("2026-02-01T00:00:00.000Z"),
            },
            {
                _id: legacyNewLowId,
                conversationId: legacyConversationId,
                senderDid: "did:legacy-other",
                body: "new fixture",
                createdAt: new Date("2026-02-02T00:00:00.000Z"),
            },
        ] as any[]);
        await ChatReadStates.insertOne({
            userDid: "did:legacy-self",
            conversationId: legacyConversationId,
            lastReadMessageId: null,
            legacyLastReadMessageId: legacyOldHighId.toString(),
            topicFallbackMessageId: legacyOldHighId.toString(),
            readStateVersion: 2,
            readStateMigratedAt: new Date(),
            updatedAt: new Date(),
        } as any);
        assert.equal(await getLegacyUnreadCountForUser("did:legacy-self", legacyConversationId), 1);
        await Promise.all([
            markConversationRead("did:legacy-self", legacyConversationId, legacyNewLowId.toString()),
            markConversationRead("did:legacy-self", legacyConversationId, legacyOldHighId.toString()),
        ]);
        assert.equal(
            (
                await ChatReadStates.findOne({
                    userDid: "did:legacy-self",
                    conversationId: legacyConversationId,
                })
            )?.legacyLastReadMessageId,
            legacyNewLowId.toString(),
            "concurrent acknowledgement cannot move the legacy cursor backward",
        );

        console.log("Messaging Stage 1A Mongo regression tests passed (production persistence helpers)");
    } finally {
        nextHeaders.cookies = productionCookies;
        await db.dropDatabase();
        await dbModule.client.close();
    }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
