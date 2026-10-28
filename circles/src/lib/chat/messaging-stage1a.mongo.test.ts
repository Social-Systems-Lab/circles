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
        deleteMessage,
        fetchMessagesSince,
        getLegacyUnreadCountForUser,
        getTopicUnreadCountsForUser,
        getTopicSortOrder,
        getConversationNotificationsMuted,
        getConversationNotificationMutePreferences,
        listConversationCandidatesForUser,
        mapConversationToChatRoomDisplay,
        markConversationRead,
        markTopicRead,
        setTopicSortOrder,
        setConversationNotificationsMuted,
        toggleReaction,
    } = await import("@/lib/data/mongo-chat");
    const { sendNotifications } = await import("@/lib/data/notifications");
    const { discardDmDraftRecord, publishDmFirstTopic, reconcilePublishedDmDraft, saveDmDraftRecord } = await import(
        "./dm-draft-persistence"
    );
    const { processFirstTopicNotifications } = await import("./first-topic-notifications");
    const { hasReadConversationAfterMessage } = await import("@/lib/data/message-reminders");
    const {
        CanonicalDmClaims,
        ChatConversations,
        ChatConversationPreferences,
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
        assert.equal(pmNotification?.content?.messageId, publication.topicId);
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

        const topicAReply = await createThreadReply(publication.topicId, publication.conversationId, "did:sender", {
            body: "Topic A reply",
        });
        const topicAFutureReply = await createThreadReply(
            publication.topicId,
            publication.conversationId,
            "did:sender",
            { body: "Topic A future reply" },
        );
        const starterBeforeIdempotentReply = await ChatMessageDocs.findOne({
            _id: new ObjectId(publication.topicId),
        });
        const idempotentSubmissionId = "topic-reply-idempotency-test";
        const idempotentReply = await createThreadReply(publication.topicId, publication.conversationId, "did:sender", {
            body: "Idempotent topic reply",
            submissionId: idempotentSubmissionId,
        });
        const recoveredIdempotentReply = await createThreadReply(
            publication.topicId,
            publication.conversationId,
            "did:sender",
            { body: "Idempotent topic reply", submissionId: idempotentSubmissionId },
        );
        assert.equal(recoveredIdempotentReply?._id, idempotentReply?._id, "retry returns the committed topic reply");
        assert.equal(
            await ChatMessageDocs.countDocuments({ senderDid: "did:sender", submissionId: idempotentSubmissionId }),
            1,
            "retry cannot create a duplicate topic reply",
        );
        assert.equal(
            (
                await ChatMessageDocs.findOne({
                    _id: new ObjectId(publication.topicId),
                })
            )?.thread?.replyCount,
            (starterBeforeIdempotentReply?.thread?.replyCount || 0) + 1,
            "retry increments the topic reply count only once",
        );
        assert.equal(await deleteMessage(idempotentReply!._id!.toString(), "did:sender"), true);
        const starterAfterReplyDeletion = await ChatMessageDocs.findOne({
            _id: new ObjectId(publication.topicId),
        });
        assert.equal(
            starterAfterReplyDeletion?.thread?.replyCount,
            starterBeforeIdempotentReply?.thread?.replyCount,
            "reply deletion restores the previous reply count",
        );
        assert.equal(
            starterAfterReplyDeletion?.thread?.updatedAt?.toISOString(),
            topicAFutureReply?.createdAt.toISOString(),
            "reply deletion restores activity from the latest remaining reply",
        );

        assert.equal(await getTopicSortOrder("did:sender", publication.conversationId), "latest_activity");
        await setTopicSortOrder("did:sender", publication.conversationId, "date_created");
        assert.equal(await getTopicSortOrder("did:sender", publication.conversationId), "date_created");
        assert.equal(
            await getTopicSortOrder("did:receiver", publication.conversationId),
            "latest_activity",
            "topic ordering preferences are isolated per user",
        );
        const readStateBeforePreference = await ChatReadStates.findOne({
            userDid: "did:sender",
            conversationId: publication.conversationId,
        });
        await setTopicSortOrder("did:sender", publication.conversationId, "latest_activity");
        assert.deepEqual(
            await ChatReadStates.findOne({ userDid: "did:sender", conversationId: publication.conversationId }),
            readStateBeforePreference,
            "saving a topic preference does not create, migrate, or modify chat read state",
        );
        assert.equal(
            await ChatConversationPreferences.countDocuments({
                userDid: "did:sender",
                conversationId: publication.conversationId,
            }),
            1,
            "repeated preference writes retain one logical preference record",
        );

        const concurrentPreferenceDid = "did:concurrent-preference";
        const readStateCountBeforeConcurrentPreference = await ChatReadStates.countDocuments({});
        const topicReadStateCountBeforeConcurrentPreference = await ChatTopicReadStates.countDocuments({});
        const conversationBeforeConcurrentPreference = await ChatConversations.findOne({
            _id: new ObjectId(publication.conversationId),
        });
        await Promise.all([
            setTopicSortOrder(concurrentPreferenceDid, publication.conversationId, "date_created"),
            setConversationNotificationsMuted(concurrentPreferenceDid, publication.conversationId, true),
        ]);
        assert.deepEqual(
            await ChatConversationPreferences.findOne(
                { userDid: concurrentPreferenceDid, conversationId: publication.conversationId },
                { projection: { _id: 0, topicSortOrder: 1, notificationsMuted: 1 } },
            ),
            { topicSortOrder: "date_created", notificationsMuted: true },
            "concurrent first-time preference writes preserve both fields",
        );
        assert.equal(
            await ChatConversationPreferences.countDocuments({
                userDid: concurrentPreferenceDid,
                conversationId: publication.conversationId,
            }),
            1,
        );
        assert.equal(await getConversationNotificationsMuted("did:receiver", publication.conversationId), false);
        assert.equal(await ChatReadStates.countDocuments({}), readStateCountBeforeConcurrentPreference);
        assert.equal(await ChatTopicReadStates.countDocuments({}), topicReadStateCountBeforeConcurrentPreference);
        assert.equal(
            (await ChatConversations.findOne({ _id: new ObjectId(publication.conversationId) }))?.updatedAt?.getTime(),
            conversationBeforeConcurrentPreference?.updatedAt?.getTime(),
            "preference writes do not change conversation activity",
        );

        await setConversationNotificationsMuted("did:receiver", publication.conversationId, true);
        assert.deepEqual(
            await getConversationNotificationMutePreferences("did:receiver", [
                publication.conversationId,
                new ObjectId().toString(),
                publication.conversationId,
            ]),
            { [publication.conversationId]: true },
            "batched mute preferences are deduplicated and scoped to the requested user",
        );
        assert.deepEqual(
            await getConversationNotificationMutePreferences("did:sender", [publication.conversationId]),
            {},
            "another user's batch does not expose the recipient's preference",
        );
        const mutedNotificationCount = await Notifications.countDocuments({ userId: "did:receiver" });
        await sendNotifications("pm_received", [{ did: "did:receiver" }, { did: "did:unmuted-participant" }], {
            roomId: publication.conversationId,
            user: { name: "Sender" },
        });
        assert.equal(await Notifications.countDocuments({ userId: "did:receiver" }), mutedNotificationCount);
        assert.equal(
            await Notifications.countDocuments({ userId: "did:unmuted-participant", type: "pm_received" }),
            1,
            "one participant's mute does not suppress another participant",
        );
        const productionPreferenceFind = ChatConversationPreferences.find;
        const productionConsoleError = console.error;
        const preferenceLookupErrors: unknown[][] = [];
        (ChatConversationPreferences as any).find = () => ({
            toArray: async () => {
                throw new Error("simulated mute lookup failure with private body: do not log me");
            },
        });
        console.error = (...args: unknown[]) => preferenceLookupErrors.push(args);
        try {
            await sendNotifications("pm_received", [{ did: "did:lookup-fallback-recipient" }], {
                roomId: publication.conversationId,
                messageBody: "private fallback message",
            });
        } finally {
            (ChatConversationPreferences as any).find = productionPreferenceFind;
            console.error = productionConsoleError;
        }
        assert.equal(
            await Notifications.countDocuments({ userId: "did:lookup-fallback-recipient", type: "pm_received" }),
            1,
            "mute lookup failure fails open and still persists the legitimate notification",
        );
        assert.equal(preferenceLookupErrors.length, 1);
        assert.equal(JSON.stringify(preferenceLookupErrors).includes("private fallback message"), false);
        assert.equal(JSON.stringify(preferenceLookupErrors).includes("private body"), false);
        const publicationConversation = await ChatConversations.findOne({
            _id: new ObjectId(publication.conversationId),
        });
        await mongoActions.sendConversationMessageNotifications({
            conversationId: publication.conversationId,
            conversation: publicationConversation,
            senderDid: "did:sender",
            messageBody: "Muted ordinary message",
            messageId: new ObjectId().toString(),
        });
        await mongoActions.sendConversationMessageNotifications({
            conversationId: publication.conversationId,
            conversation: publicationConversation,
            senderDid: "did:sender",
            messageBody: "Muted topic reply",
            messageId: new ObjectId().toString(),
            topicId: publication.topicId,
        });
        await mongoActions.sendConversationMessageNotifications({
            conversationId: publication.conversationId,
            conversation: publicationConversation,
            senderDid: "did:sender",
            messageBody: "Muted [Receiver](/circles/receiver) mention",
            messageId: new ObjectId().toString(),
            topicId: publication.topicId,
        });
        const mutedAttachment = new FormData();
        mutedAttachment.set("roomId", publication.conversationId);
        mutedAttachment.set("file", new File(["muted"], "muted.txt", { type: "text/plain" }));
        const mutedAttachmentResult = await runWithChatActionContext(
            {
                viewerDid: "did:sender",
                findMessagingUser: async () => ({ isAdmin: true }),
                saveFile: async (file: File) => ({
                    url: "/storage/muted.txt",
                    fileName: "muted.txt",
                    originalName: file.name,
                }),
                createMessage: async (input) => ({ ...input, _id: new ObjectId().toString() }),
            },
            () => mongoActions.sendMongoAttachmentAction(mutedAttachment),
        );
        assert.equal(mutedAttachmentResult.success, true);
        assert.equal(
            await Notifications.countDocuments({ userId: "did:receiver" }),
            mutedNotificationCount,
            "muted ordinary messages, attachments using the same delivery path, and replies create no notification",
        );
        await sendNotifications("new_follower", [{ did: "did:receiver" }], {
            roomId: publication.conversationId,
            user: { name: "Sender" },
        });
        assert.equal(
            await Notifications.countDocuments({ userId: "did:receiver" }),
            mutedNotificationCount + 1,
            "unrelated notification types are not suppressed by conversation mute",
        );
        await setConversationNotificationsMuted("did:receiver", publication.conversationId, false);
        await mongoActions.sendConversationMessageNotifications({
            conversationId: publication.conversationId,
            conversation: publicationConversation,
            senderDid: "did:sender",
            messageBody: "Unmuted message",
            messageId: new ObjectId().toString(),
        });
        assert.equal(
            await Notifications.countDocuments({ userId: "did:receiver", type: "pm_received" }),
            2,
            "unmuting restores future notification delivery",
        );

        await Circles.insertMany([
            {
                _id: new ObjectId(),
                did: "did:muted-topic-sender",
                name: "Muted Sender",
                handle: "muted-topic-sender",
                circleType: "user",
            },
            {
                _id: new ObjectId(),
                did: "did:muted-topic-receiver",
                name: "Muted Receiver",
                handle: "muted-topic-receiver",
                circleType: "user",
            },
        ] as any[]);
        const mutedFirstTopic = await publishDmFirstTopic({
            authorDid: "did:muted-topic-sender",
            recipientDid: "did:muted-topic-receiver",
            title: "Muted first topic",
            body: "Muted first topic body",
            hashtags: [],
            generation: "muted-first-topic-generation",
            submissionId: "9123456789abcdef01234567",
            processNotifications: false,
        });
        await setConversationNotificationsMuted("did:muted-topic-receiver", mutedFirstTopic.conversationId, true);
        assert.equal((await processFirstTopicNotifications(1, mutedFirstTopic.topicId)).delivered, 1);
        assert.equal(
            await Notifications.countDocuments({
                userId: "did:muted-topic-receiver",
                "content.roomId": mutedFirstTopic.conversationId,
            }),
            0,
            "muted first topics are acknowledged without persisting notifications",
        );

        const concurrentTopic = await createThread(
            publication.conversationId,
            "did:sender",
            "Concurrent topic",
            "Concurrent body",
            [],
        );
        assert.ok(concurrentTopic?._id);
        const concurrentReplyA = await createThreadReply(
            concurrentTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Concurrent A" },
        );
        const concurrentReplyB = await createThreadReply(
            concurrentTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Concurrent B" },
        );
        assert.ok(concurrentReplyA?._id && concurrentReplyB?._id);
        await Promise.all([
            deleteMessage(concurrentReplyA!._id!.toString(), "did:sender"),
            deleteMessage(concurrentReplyB!._id!.toString(), "did:sender"),
        ]);
        const afterConcurrentDeletes = await ChatMessageDocs.findOne({
            _id: new ObjectId(concurrentTopic!._id!.toString()),
        });
        assert.equal(afterConcurrentDeletes?.thread?.replyCount, 0, "concurrent deletions decrement independently");
        assert.equal(
            afterConcurrentDeletes?.thread?.updatedAt?.toISOString(),
            concurrentTopic?.thread?.createdAt.toISOString(),
            "concurrent deletions restore topic creation activity",
        );

        const replyToDeleteDuringInsert = await createThreadReply(
            concurrentTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Delete while inserting" },
        );
        assert.ok(replyToDeleteDuringInsert?._id);
        const [, insertedDuringDelete] = await Promise.all([
            deleteMessage(replyToDeleteDuringInsert!._id!.toString(), "did:sender"),
            createThreadReply(concurrentTopic!._id!.toString(), publication.conversationId, "did:sender", {
                body: "Inserted during deletion",
            }),
        ]);
        assert.ok(insertedDuringDelete?._id);
        const afterConcurrentInsertDelete = await ChatMessageDocs.findOne({
            _id: new ObjectId(concurrentTopic!._id!.toString()),
        });
        assert.equal(afterConcurrentInsertDelete?.thread?.replyCount, 1);
        assert.equal(
            afterConcurrentInsertDelete?.thread?.updatedAt?.toISOString(),
            insertedDuringDelete?.createdAt.toISOString(),
            "deletion cannot overwrite newer reply activity",
        );
        const topicB = await createThread(publication.conversationId, "did:sender", "Topic B", "Topic B body", []);
        assert.ok(topicAReply?._id && topicAFutureReply?._id && topicB?._id);
        await Notifications.insertMany([
            {
                userId: "did:receiver",
                type: "pm_received",
                content: {
                    roomId: publication.conversationId,
                    topicId: publication.topicId,
                    messageId: topicAReply!._id,
                },
                isRead: false,
                createdAt: new Date(),
            },
            {
                userId: "did:receiver",
                type: "pm_received",
                content: {
                    roomId: publication.conversationId,
                    topicId: publication.topicId,
                    messageId: topicAFutureReply!._id,
                },
                isRead: false,
                createdAt: new Date(),
            },
            {
                userId: "did:receiver",
                type: "pm_received",
                content: {
                    roomId: publication.conversationId,
                    topicId: topicB!._id,
                    messageId: topicB!._id,
                },
                isRead: false,
                createdAt: new Date(),
            },
            {
                userId: "did:receiver",
                type: "pm_received",
                content: { roomId: publication.conversationId },
                isRead: false,
                createdAt: new Date(),
            },
        ] as any[]);
        const failedTopicRead = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.markTopicReadAction(publication.conversationId, publication.topicId, topicB!._id!.toString()),
        );
        assert.equal(failedTopicRead.success, false);
        assert.equal(
            await Notifications.countDocuments({
                userId: "did:receiver",
                type: "pm_received",
                isRead: false,
                "content.messageId": { $in: [topicAReply!._id, topicAFutureReply!._id, topicB!._id] },
            }),
            3,
            "a failed topic acknowledgement clears nothing",
        );
        const successfulTopicRead = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.markTopicReadAction(
                publication.conversationId,
                publication.topicId,
                topicAReply!._id!.toString(),
            ),
        );
        assert.equal(successfulTopicRead.success, true);
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.messageId": topicAReply!._id,
                })
            )?.isRead,
            true,
            "successful topic acknowledgement clears the eligible Topic A notification",
        );
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.messageId": topicAFutureReply!._id,
                })
            )?.isRead,
            false,
            "a Topic A notification after the boundary remains unread",
        );
        assert.equal(
            (await Notifications.findOne({ userId: "did:receiver", "content.messageId": topicB!._id }))?.isRead,
            false,
            "reading Topic A does not clear Topic B",
        );
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.roomId": publication.conversationId,
                    "content.topicId": { $exists: false },
                })
            )?.isRead,
            false,
            "historical room-only PM notifications remain unread",
        );

        const reactionTopic = await createThread(
            publication.conversationId,
            "did:sender",
            "Reaction read topic",
            "Starter",
            [],
        );
        assert.ok(reactionTopic?._id);
        const reactionReply = await createThreadReply(
            reactionTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "React here" },
        );
        const newerReactionReply = await createThreadReply(
            reactionTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Newer unread reply" },
        );
        assert.ok(reactionReply?._id && newerReactionReply?._id);
        const concurrentReactionMessage = await createMessage({
            conversationId: publication.conversationId,
            senderDid: "did:sender",
            body: "Concurrent reaction target",
            createdAt: new Date(),
        });
        const sameEmojiResults = await Promise.all([
            toggleReaction(concurrentReactionMessage._id!.toString(), "did:receiver", "👍"),
            toggleReaction(concurrentReactionMessage._id!.toString(), "did:receiver", "👍"),
        ]);
        assert.deepEqual(
            sameEmojiResults.map((result) => result?.added).sort(),
            [false, true],
            "concurrent same-emoji toggles serialize as one addition and one removal",
        );
        assert.equal(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(concurrentReactionMessage._id!) }))?.reactions?.length,
            0,
        );
        const differentEmojiResults = await Promise.all([
            toggleReaction(concurrentReactionMessage._id!.toString(), "did:receiver", "👍"),
            toggleReaction(concurrentReactionMessage._id!.toString(), "did:receiver", "❤️"),
        ]);
        assert.equal(
            differentEmojiResults.every((result) => result?.added === true),
            true,
        );
        assert.deepEqual(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(concurrentReactionMessage._id!) }))?.reactions
                ?.map((reaction) => reaction.emoji)
                .sort(),
            ["❤️", "👍"].sort(),
            "concurrent different-emoji toggles preserve both reactions",
        );
        await Notifications.insertMany([
            {
                userId: "did:receiver",
                type: "pm_received",
                content: {
                    roomId: publication.conversationId,
                    topicId: reactionTopic!._id,
                    messageId: reactionReply!._id,
                },
                isRead: false,
                createdAt: new Date(),
            },
            {
                userId: "did:receiver",
                type: "pm_received",
                content: {
                    roomId: publication.conversationId,
                    topicId: reactionTopic!._id,
                    messageId: newerReactionReply!._id,
                },
                isRead: false,
                createdAt: new Date(),
            },
        ] as any[]);
        const conversationActivityBeforeReaction = (
            await ChatConversations.findOne({ _id: new ObjectId(publication.conversationId) })
        )?.updatedAt;
        const starterReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(reactionTopic!._id!.toString(), "🌱"),
        );
        assert.equal(starterReaction.success, true);
        assert.equal(starterReaction.reactionAdded, true);
        assert.equal(starterReaction.readStatePersisted, true);
        assert.deepEqual(
            (await ChatConversations.findOne({ _id: new ObjectId(publication.conversationId) }))?.updatedAt,
            conversationActivityBeforeReaction,
            "reactions and reaction read-state updates do not reorder conversations",
        );
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                    topicId: reactionTopic!._id,
                })
            )?.lastReadMessageId,
            reactionTopic!._id,
            "reacting to a starter advances only through the starter",
        );
        const replyReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(reactionReply!._id!.toString(), "👍"),
        );
        assert.equal(replyReaction.success, true);
        assert.equal(replyReaction.reactionAdded, true);
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                    topicId: reactionTopic!._id,
                })
            )?.lastReadMessageId,
            reactionReply!._id,
        );
        assert.equal(
            (
                await getTopicUnreadCountsForUser("did:receiver", publication.conversationId, [
                    reactionTopic!._id!.toString(),
                ])
            )[reactionTopic!._id!.toString()],
            1,
            "a newer reply remains unread after reacting to a historical reply",
        );
        assert.equal(
            (await Notifications.findOne({ userId: "did:receiver", "content.messageId": reactionReply!._id }))?.isRead,
            true,
            "reaction acknowledgement includes the reacted reply",
        );
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.messageId": newerReactionReply!._id,
                })
            )?.isRead,
            false,
            "reaction acknowledgement excludes newer replies",
        );
        assert.equal(
            await ChatTopicReadStates.countDocuments({
                userDid: "did:receiver",
                conversationId: publication.conversationId,
                topicId: topicB!._id,
            }),
            0,
            "reacting in one topic does not create or change another topic cursor",
        );
        const removedReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(reactionReply!._id!.toString(), "👍"),
        );
        assert.equal(removedReaction.reactionAdded, false);
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                    topicId: reactionTopic!._id,
                })
            )?.lastReadMessageId,
            reactionReply!._id,
            "reaction removal leaves the read cursor unchanged",
        );
        await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(newerReactionReply!._id!.toString(), "✅"),
        );
        await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(reactionReply!._id!.toString(), "❤️"),
        );
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                    topicId: reactionTopic!._id,
                })
            )?.lastReadMessageId,
            newerReactionReply!._id,
            "a later reaction to an older reply cannot move the cursor backward",
        );

        const looseReactionMessage = await createMessage({
            conversationId: publication.conversationId,
            senderDid: "did:sender",
            body: "Legacy loose reaction",
            createdAt: new Date(),
        });
        const topicReadStateCountBeforeLooseReaction = await ChatTopicReadStates.countDocuments({
            userDid: "did:receiver",
            conversationId: publication.conversationId,
        });
        const looseReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(looseReactionMessage._id!.toString(), "👍"),
        );
        assert.equal(looseReaction.reactionAdded, true);
        assert.equal(
            (
                await ChatReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                })
            )?.legacyLastReadMessageId,
            looseReactionMessage._id,
            "a loose-message reaction advances only the legacy cursor",
        );
        assert.equal(
            await ChatTopicReadStates.countDocuments({
                userDid: "did:receiver",
                conversationId: publication.conversationId,
            }),
            topicReadStateCountBeforeLooseReaction,
            "a loose-message reaction does not create or update a topic cursor",
        );

        const missingTopicId = new ObjectId();
        const orphanReplyId = new ObjectId();
        await ChatMessageDocs.insertOne({
            _id: orphanReplyId,
            conversationId: publication.conversationId,
            senderDid: "did:sender",
            body: "Orphan reply",
            threadId: missingTopicId.toString(),
            createdAt: new Date(),
        });
        const orphanReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(orphanReplyId.toString(), "👍"),
        );
        assert.equal(orphanReaction.success, false);
        assert.equal((await ChatMessageDocs.findOne({ _id: orphanReplyId }))?.reactions, undefined);

        const deletingReactionTopic = await createThread(
            publication.conversationId,
            "did:sender",
            "Deleting reaction topic",
            "Starter",
            [],
        );
        assert.ok(deletingReactionTopic?._id);
        await ChatMessageDocs.updateOne(
            { _id: new ObjectId(deletingReactionTopic!._id!) },
            { $set: { "thread.deletingAt": new Date() } },
        );
        const deletingTopicReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(deletingReactionTopic!._id!.toString(), "👍"),
        );
        assert.equal(deletingTopicReaction.success, false);
        assert.equal(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(deletingReactionTopic!._id!) }))?.reactions,
            undefined,
        );

        const partialReadTopic = await createThread(
            publication.conversationId,
            "did:sender",
            "Partial reaction read",
            "Starter",
            [],
        );
        const partialReadReply = await createThreadReply(
            partialReadTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Reaction survives read failure" },
        );
        assert.ok(partialReadTopic?._id && partialReadReply?._id);
        await ChatTopicReadStates.insertOne({
            userDid: "did:receiver",
            conversationId: publication.conversationId,
            topicId: partialReadTopic!._id!.toString(),
            lastReadMessageId: new ObjectId().toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
        const partialReaction = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.toggleMongoReactionAction(partialReadReply!._id!.toString(), "👍"),
        );
        assert.equal(partialReaction.success, true);
        assert.equal(partialReaction.reactionAdded, true);
        assert.equal(partialReaction.readStatePersisted, false);
        assert.ok(partialReaction.readStateWarning);
        assert.equal(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(partialReadReply!._id!) }))?.reactions?.length,
            1,
        );

        const notificationFailureTopic = await createThread(
            publication.conversationId,
            "did:sender",
            "Reaction notification failure",
            "Starter",
            [],
        );
        const notificationFailureReply = await createThreadReply(
            notificationFailureTopic!._id!.toString(),
            publication.conversationId,
            "did:sender",
            { body: "Notification failure reaction" },
        );
        assert.ok(notificationFailureTopic?._id && notificationFailureReply?._id);
        await Notifications.insertOne({
            userId: "did:receiver",
            type: "pm_received",
            content: {
                roomId: publication.conversationId,
                topicId: notificationFailureTopic!._id,
                messageId: notificationFailureReply!._id,
            },
            isRead: false,
            createdAt: new Date(),
        } as any);
        const notificationUpdateMany = Notifications.updateMany;
        (Notifications as any).updateMany = async () => {
            throw new Error("simulated reaction notification failure");
        };
        let notificationFailureReaction;
        try {
            notificationFailureReaction = await runWithAuthenticatedRequest("did:receiver", () =>
                mongoActions.toggleMongoReactionAction(notificationFailureReply!._id!.toString(), "👍"),
            );
        } finally {
            (Notifications as any).updateMany = notificationUpdateMany;
        }
        assert.equal(notificationFailureReaction?.success, true);
        assert.equal(notificationFailureReaction?.reactionAdded, true);
        assert.equal(notificationFailureReaction?.readStatePersisted, true);
        assert.ok(notificationFailureReaction?.readStateWarning);
        assert.equal(
            (await ChatMessageDocs.findOne({ _id: new ObjectId(notificationFailureReply!._id!) }))?.reactions?.length,
            1,
        );
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.messageId": notificationFailureReply!._id,
                })
            )?.isRead,
            false,
        );

        const disappearingReactionMessage = await createMessage({
            conversationId: publication.conversationId,
            senderDid: "did:sender",
            body: "Disappearing reaction target",
            createdAt: new Date(),
        });
        const productionMessageUpdateOne = ChatMessageDocs.updateOne;
        (ChatMessageDocs as any).updateOne = async (filter: any, update: any, options?: any) => {
            if (String(filter?._id) === disappearingReactionMessage._id!.toString() && update?.$set?.reactions) {
                await ChatMessageDocs.deleteOne({ _id: new ObjectId(disappearingReactionMessage._id!) });
            }
            return productionMessageUpdateOne.call(ChatMessageDocs, filter, update, options);
        };
        let disappearingReaction;
        try {
            disappearingReaction = await runWithAuthenticatedRequest("did:receiver", () =>
                mongoActions.toggleMongoReactionAction(disappearingReactionMessage._id!.toString(), "👍"),
            );
        } finally {
            (ChatMessageDocs as any).updateOne = productionMessageUpdateOne;
        }
        assert.equal(disappearingReaction?.success, false, "an unmatched primary write cannot report success");

        const unauthorizedReactionCount = await ChatMessageDocs.countDocuments({
            _id: new ObjectId(reactionReply!._id!),
            "reactions.userDid": "did:unauthorized-reaction",
        });
        const unauthorizedReadStateCount = await ChatTopicReadStates.countDocuments({
            userDid: "did:unauthorized-reaction",
            conversationId: publication.conversationId,
        });
        const unauthorizedReaction = await runWithAuthenticatedRequest("did:unauthorized-reaction", () =>
            mongoActions.toggleMongoReactionAction(reactionReply!._id!.toString(), "👍"),
        );
        assert.equal(unauthorizedReaction.success, false);
        assert.equal(
            await ChatMessageDocs.countDocuments({
                _id: new ObjectId(reactionReply!._id!),
                "reactions.userDid": "did:unauthorized-reaction",
            }),
            unauthorizedReactionCount,
        );
        assert.equal(
            await ChatTopicReadStates.countDocuments({
                userDid: "did:unauthorized-reaction",
                conversationId: publication.conversationId,
            }),
            unauthorizedReadStateCount,
        );

        const retryReply = await createThreadReply(publication.topicId, publication.conversationId, "did:sender", {
            body: "Retryable notification reply",
        });
        assert.ok(retryReply?._id);
        await Notifications.insertOne({
            userId: "did:receiver",
            type: "pm_received",
            content: {
                roomId: publication.conversationId,
                topicId: publication.topicId,
                messageId: retryReply!._id,
            },
            isRead: false,
            createdAt: new Date(),
        } as any);
        const originalUpdateMany = Notifications.updateMany;
        (Notifications as any).updateMany = async () => {
            throw new Error("simulated notification persistence failure");
        };
        let partialTopicRead;
        try {
            partialTopicRead = await runWithAuthenticatedRequest("did:receiver", () =>
                mongoActions.markTopicReadAction(
                    publication.conversationId,
                    publication.topicId,
                    retryReply!._id!.toString(),
                ),
            );
        } finally {
            (Notifications as any).updateMany = originalUpdateMany;
        }
        assert.equal(partialTopicRead?.success, false);
        assert.equal(partialTopicRead?.readStatePersisted, true);
        assert.equal(
            (
                await ChatTopicReadStates.findOne({
                    userDid: "did:receiver",
                    conversationId: publication.conversationId,
                    topicId: publication.topicId,
                })
            )?.lastReadMessageId,
            retryReply!._id,
            "notification failure does not roll back the successfully advanced read cursor",
        );
        assert.equal(
            (await Notifications.findOne({ userId: "did:receiver", "content.messageId": retryReply!._id }))?.isRead,
            false,
        );
        const retriedTopicRead = await runWithAuthenticatedRequest("did:receiver", () =>
            mongoActions.markTopicReadAction(
                publication.conversationId,
                publication.topicId,
                retryReply!._id!.toString(),
            ),
        );
        assert.equal(retriedTopicRead.success, true);
        assert.equal(
            (await Notifications.findOne({ userId: "did:receiver", "content.messageId": retryReply!._id }))?.isRead,
            true,
            "a later valid interaction retries notification acknowledgement without advancing the cursor",
        );

        const deletedCursor = new ObjectId().toString();
        const afterDeletedCursorReply = await createThreadReply(
            publication.topicId,
            publication.conversationId,
            "did:sender",
            { body: "Reply after deleted cursor" },
        );
        assert.ok(afterDeletedCursorReply?._id);
        await ChatTopicReadStates.updateOne(
            {
                userDid: "did:receiver",
                conversationId: publication.conversationId,
                topicId: publication.topicId,
            },
            { $set: { lastReadMessageId: deletedCursor } },
        );
        await Notifications.insertOne({
            userId: "did:receiver",
            type: "pm_received",
            content: {
                roomId: publication.conversationId,
                topicId: publication.topicId,
                messageId: afterDeletedCursorReply!._id,
            },
            isRead: false,
            createdAt: new Date(),
        } as any);
        await assert.rejects(
            runWithAuthenticatedRequest("did:receiver", () =>
                mongoActions.markTopicReadAction(
                    publication.conversationId,
                    publication.topicId,
                    afterDeletedCursorReply!._id!.toString(),
                ),
            ),
            /unresolved chat read cursor/,
        );
        assert.equal(
            (
                await Notifications.findOne({
                    userId: "did:receiver",
                    "content.messageId": afterDeletedCursorReply!._id,
                })
            )?.isRead,
            false,
            "an unresolved existing cursor clears zero notifications",
        );

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
        const reminderTarget = await ChatMessageDocs.findOne({ _id: replyId(1) });
        const chronologicalReadState = await ChatReadStates.findOne({
            userDid: "did:chrono-p1",
            conversationId: chronologicalConversationId,
        });
        assert.ok(reminderTarget);
        assert.equal(
            await hasReadConversationAfterMessage({
                conversationId: chronologicalConversationId,
                recipientDid: "did:chrono-p1",
                messageId: replyId(1).toString(),
                message: reminderTarget,
                readState: chronologicalReadState,
            }),
            false,
            "reminder comparisons treat a chronologically later lower-ObjectId reply as unread",
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

        const missingTimestampConversationId = new ObjectId().toString();
        const missingTimestampCursorId = new ObjectId("64c000000000000000000001");
        const missingTimestampTargetId = new ObjectId("64c000000000000000000002");
        await ChatMessageDocs.insertMany([
            {
                _id: missingTimestampCursorId,
                conversationId: missingTimestampConversationId,
                senderDid: "did:missing-timestamp-self",
                body: "cursor fixture",
            },
            {
                _id: missingTimestampTargetId,
                conversationId: missingTimestampConversationId,
                senderDid: "did:missing-timestamp-other",
                body: "target fixture",
            },
        ] as any[]);
        const missingTimestampTarget = await ChatMessageDocs.findOne({ _id: missingTimestampTargetId });
        assert.ok(missingTimestampTarget);
        assert.equal(
            await hasReadConversationAfterMessage({
                conversationId: missingTimestampConversationId,
                recipientDid: "did:missing-timestamp-self",
                messageId: missingTimestampTargetId.toString(),
                message: missingTimestampTarget,
                readState: {
                    userDid: "did:missing-timestamp-self",
                    conversationId: missingTimestampConversationId,
                    lastReadMessageId: null,
                    legacyLastReadMessageId: missingTimestampCursorId.toString(),
                    topicFallbackMessageId: missingTimestampCursorId.toString(),
                    readStateVersion: 2,
                } as any,
            }),
            false,
            "missing historical timestamps conservatively fall back to ObjectId ordering",
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
