import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ObjectId } from "mongodb";

const databaseName = process.env.CIRCLES_MONGODB_DATABASE || "";
const mongoUri = process.env.MONGODB_URI || "";
if (process.env.NODE_ENV !== "test") throw new Error("Refusing Mongo regression test outside NODE_ENV=test");
if (!/^circles_stage1a_test_followups_[a-z0-9_-]+$/i.test(databaseName)) {
    throw new Error("Refusing non-disposable database");
}
const mongoUrl = new URL(mongoUri);
if (!["127.0.0.1", "localhost"].includes(mongoUrl.hostname)) throw new Error("Refusing non-local MongoDB");
if (mongoUrl.port !== "27028") throw new Error("Refusing non-disposable MongoDB port");

async function main() {
    process.env.CIRCLES_JWT_SECRET ||= "follow-up-action-test-secret";
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
    const {
        ChatConversations,
        ChatMessageDocs,
        ChatMessageFollowUps,
        ChatRoomMembers,
        ChatReadStates,
        ChatTopicReadStates,
        Circles,
        Members,
        Notifications,
        db,
        client,
        ensureRequiredChatIndexes,
    } = await import("@/lib/data/db");
    const { listAuthorizedMessageFollowUps, markMessageForFollowUp, setFollowUpCompleted, updateFollowUpNote } =
        await import("@/lib/data/chat-message-followups");
    const { evaluateConversationAccess } = await import("./conversation-access-policy");
    const followUpActions = await import("@/components/modules/chat/follow-up-actions");
    const runWithAuthenticatedRequest = async <T>(viewerDid: string, callback: () => Promise<T>): Promise<T> => {
        authenticatedRequestToken = await generateUserToken(viewerDid);
        try {
            return await callback();
        } finally {
            authenticatedRequestToken = undefined;
        }
    };

    const allowedByDid = new Map<string, Set<string>>();
    const canRead = async (ownerDid: string, conversationIds: string[]) => {
        const allowed = allowedByDid.get(ownerDid) || new Set<string>();
        return new Set(conversationIds.filter((id) => allowed.has(id)));
    };

    try {
        await db.dropDatabase();
        await ensureRequiredChatIndexes();

        const ownerDid = "did:follow-up-owner";
        const otherDid = "did:follow-up-other";
        const conversationId = new ObjectId().toString();
        const originalConversationTime = new Date("2025-01-01T00:00:00.000Z");
        allowedByDid.set(ownerDid, new Set([conversationId]));
        allowedByDid.set(otherDid, new Set([conversationId]));
        await ChatConversations.insertOne({
            _id: new ObjectId(conversationId),
            type: "dm",
            name: `dm-${ownerDid}-${otherDid}`,
            handle: `dm-${ownerDid}-${otherDid}`,
            participants: [ownerDid, otherDid],
            createdAt: originalConversationTime,
            updatedAt: originalConversationTime,
        });
        await Circles.insertOne({
            _id: new ObjectId(),
            circleType: "user",
            did: otherDid,
            name: "Other User",
            handle: "other",
            picture: { url: "/storage/other.png" },
        } as any);
        await ChatReadStates.insertOne({
            ownerDid,
            userDid: ownerDid,
            conversationId,
            lastReadMessageId: null,
            updatedAt: originalConversationTime,
        } as any);

        const messageId = new ObjectId();
        await ChatMessageDocs.insertOne({
            _id: messageId,
            conversationId,
            senderDid: otherDid,
            body: "Private source message",
            createdAt: new Date("2025-02-01T00:00:00.000Z"),
            submissionId: "must-not-leak",
            draftGeneration: "must-not-leak",
            reactions: [{ emoji: "x", userDid: "did:reaction-private", createdAt: new Date() }],
            attachments: [
                {
                    name: "safe.txt",
                    url: "/storage/safe.txt",
                    mimeType: "text/plain",
                    size: 12,
                    key: "private-storage-key",
                },
            ],
            firstTopicNotification: {
                state: "processing",
                attempts: 1,
                processingToken: "must-not-leak",
            },
        });

        const created = await markMessageForFollowUp(ownerDid, messageId.toString(), canRead);
        assert.ok(created);
        assert.equal(created.messageId, messageId.toString());
        assert.equal(created.conversationId, conversationId);
        assert.equal(Object.prototype.hasOwnProperty.call(created, "body"), false);
        assert.equal(Object.prototype.hasOwnProperty.call(created, "senderDid"), false);

        assert.equal(await updateFollowUpNote(ownerDid, created._id, "  private note  "), true);
        assert.equal(await setFollowUpCompleted(ownerDid, created._id, true), true);
        const completedBeforeDuplicate = await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) });
        assert.equal(await setFollowUpCompleted(ownerDid, created._id, true), true);
        const completedAfterRepeatedComplete = await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) });
        assert.equal(
            completedAfterRepeatedComplete?.completedAt?.toISOString(),
            completedBeforeDuplicate?.completedAt?.toISOString(),
        );
        assert.equal(
            completedAfterRepeatedComplete?.updatedAt.toISOString(),
            completedBeforeDuplicate?.updatedAt.toISOString(),
        );
        const duplicate = await markMessageForFollowUp(ownerDid, messageId.toString(), canRead);
        assert.equal(duplicate?._id, created._id);
        assert.equal(await ChatMessageFollowUps.countDocuments({ ownerDid, messageId: messageId.toString() }), 1);
        const completedAfterDuplicate = await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) });
        assert.equal(completedAfterDuplicate?.note, "private note");
        assert.equal(
            completedAfterDuplicate?.completedAt?.toISOString(),
            completedBeforeDuplicate?.completedAt?.toISOString(),
        );

        assert.equal(await updateFollowUpNote(otherDid, created._id, "stolen"), false);
        assert.equal(await setFollowUpCompleted(otherDid, created._id, false), false);
        assert.equal((await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) }))?.note, "private note");
        assert.equal(await setFollowUpCompleted(ownerDid, created._id, false), true);
        assert.equal((await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) }))?.completedAt, undefined);
        await new Promise((resolve) => setTimeout(resolve, 2));
        assert.equal(await setFollowUpCompleted(ownerDid, created._id, true), true);
        const completedAfterReopen = await ChatMessageFollowUps.findOne({ _id: new ObjectId(created._id) });
        assert.ok(completedAfterReopen?.completedAt);
        assert.notEqual(
            completedAfterReopen?.completedAt?.toISOString(),
            completedBeforeDuplicate?.completedAt?.toISOString(),
        );
        assert.equal(await setFollowUpCompleted(ownerDid, created._id, false), true);

        assert.equal(await markMessageForFollowUp(ownerDid, "not-an-object-id", canRead), null);
        assert.equal(await markMessageForFollowUp(ownerDid, new ObjectId().toString(), canRead), null);
        allowedByDid.set(otherDid, new Set());
        assert.equal(await markMessageForFollowUp(otherDid, messageId.toString(), canRead), null);

        const ownerList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.equal(ownerList.items.length, 1);
        assert.equal(ownerList.items[0].message?.body, "Private source message");
        assert.deepEqual(ownerList.items[0].message?.attachments, [{ name: "safe.txt" }]);
        assert.deepEqual(Object.keys(ownerList.items[0].message || {}).sort(), [
            "attachments",
            "body",
            "conversation",
            "conversationId",
            "createdAt",
            "sender",
        ]);
        assert.deepEqual(ownerList.items[0].message?.conversation, {
            name: "Other User",
            avatarUrl: "/storage/other.png",
        });
        assert.equal(JSON.stringify(ownerList.items[0]).includes(ownerDid), false);
        assert.equal(JSON.stringify(ownerList.items[0]).includes(otherDid), false);
        const otherList = await listAuthorizedMessageFollowUps(otherDid, { limit: 10 }, canRead);
        assert.deepEqual(otherList.items, []);

        const fallbackConversationId = new ObjectId().toString();
        const fallbackMessageId = new ObjectId();
        const missingParticipantDid = "did:missing-follow-up-participant";
        await ChatConversations.insertOne({
            _id: new ObjectId(fallbackConversationId),
            type: "dm",
            name: `dm-${ownerDid}-${missingParticipantDid}`,
            handle: `dm-${ownerDid}-${missingParticipantDid}`,
            participants: [ownerDid, missingParticipantDid],
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await ChatMessageDocs.insertOne({
            _id: fallbackMessageId,
            conversationId: fallbackConversationId,
            senderDid: ownerDid,
            body: "Fallback DM",
            createdAt: new Date(),
        });
        allowedByDid.set(ownerDid, new Set([conversationId, fallbackConversationId]));
        const fallbackFollowUp = await markMessageForFollowUp(ownerDid, fallbackMessageId.toString(), canRead);
        const fallbackList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.equal(
            fallbackList.items.find((item) => item.followUp.id === fallbackFollowUp?._id)?.message?.conversation.name,
            "Direct message",
        );
        assert.equal(JSON.stringify(fallbackList.items).includes(missingParticipantDid), false);
        await ChatMessageFollowUps.deleteOne({ _id: new ObjectId(fallbackFollowUp!._id) });
        await ChatMessageDocs.deleteOne({ _id: fallbackMessageId });
        await ChatConversations.deleteOne({ _id: new ObjectId(fallbackConversationId) });
        allowedByDid.set(ownerDid, new Set([conversationId]));

        const secretOwner = {
            _id: "secret-circle",
            circleType: "circle",
            visibility: "secret",
            stage: "active",
        } as any;
        const secretConversation = {
            _id: conversationId,
            type: "group",
            circleId: "secret-circle",
            participants: [ownerDid],
        };
        assert.equal(
            evaluateConversationAccess({
                conversation: secretConversation,
                viewerDid: ownerDid,
                intent: "read",
                ownerCircle: secretOwner,
                canonicalMember: true,
                chatMember: true,
            }),
            true,
        );
        assert.equal(
            evaluateConversationAccess({
                conversation: secretConversation,
                viewerDid: ownerDid,
                intent: "read",
                ownerCircle: secretOwner,
                canonicalMember: false,
                chatMember: true,
            }),
            false,
        );

        const concurrentMessageId = new ObjectId();
        await ChatMessageDocs.insertOne({
            _id: concurrentMessageId,
            conversationId,
            senderDid: otherDid,
            body: "Concurrent",
            createdAt: new Date(),
        });
        const concurrent = await Promise.all([
            markMessageForFollowUp(ownerDid, concurrentMessageId.toString(), canRead),
            markMessageForFollowUp(ownerDid, concurrentMessageId.toString(), canRead),
        ]);
        assert.ok(concurrent[0]);
        assert.equal(concurrent[0]?._id, concurrent[1]?._id);
        assert.equal(
            await ChatMessageFollowUps.countDocuments({ ownerDid, messageId: concurrentMessageId.toString() }),
            1,
        );

        assert.deepEqual(await followUpActions.markMessageForFollowUpAction(concurrentMessageId.toString()), {
            success: false,
            message: "Not authenticated",
        });
        assert.deepEqual(await followUpActions.getMessageFollowUpStatusesAction([concurrentMessageId.toString()]), {
            success: false,
            message: "Not authenticated",
        });
        const actionMessageId = new ObjectId();
        await ChatMessageDocs.insertOne({
            _id: actionMessageId,
            conversationId,
            senderDid: otherDid,
            body: "Action message",
            createdAt: new Date(),
            submissionId: "action-private",
        });
        const actionMark = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.markMessageForFollowUpAction(actionMessageId.toString()),
        );
        assert.equal(actionMark.success, true);
        assert.equal(actionMark.followUp?.ownerDid, ownerDid);
        for (const malformedStatusIds of [
            null,
            actionMessageId.toString(),
            ["bad"],
            [actionMessageId.toString(), 1],
            Array.from({ length: 201 }, () => actionMessageId.toString()),
        ]) {
            assert.deepEqual(
                await runWithAuthenticatedRequest(ownerDid, () =>
                    followUpActions.getMessageFollowUpStatusesAction(malformedStatusIds),
                ),
                { success: false, message: "Invalid request" },
            );
        }
        const actionStatuses = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.getMessageFollowUpStatusesAction([
                actionMessageId.toString().toUpperCase(),
                actionMessageId.toString(),
            ]),
        );
        assert.equal(actionStatuses.success, true);
        assert.ok("statuses" in actionStatuses);
        assert.deepEqual(actionStatuses.statuses, [
            { messageId: actionMessageId.toString(), followUpId: actionMark.followUp!._id, completed: false },
        ]);
        assert.deepEqual(Object.keys(actionStatuses.statuses[0]).sort(), ["completed", "followUpId", "messageId"]);
        const otherStatuses = await runWithAuthenticatedRequest(otherDid, () =>
            followUpActions.getMessageFollowUpStatusesAction([actionMessageId.toString()]),
        );
        assert.deepEqual(otherStatuses, { success: true, statuses: [] });
        assert.equal(
            (
                await runWithAuthenticatedRequest(otherDid, () =>
                    followUpActions.updateMessageFollowUpNoteAction(actionMark.followUp!._id, "foreign"),
                )
            ).success,
            false,
        );
        const otherActionList = await runWithAuthenticatedRequest(otherDid, () =>
            followUpActions.listMessageFollowUpsAction({ limit: 50 }),
        );
        assert.equal(otherActionList.success, true);
        assert.ok("items" in otherActionList);
        assert.equal(
            otherActionList.items.some((item) => item.followUp.id === actionMark.followUp!._id),
            false,
        );
        for (const malformed of [
            null,
            { completed: "false" },
            { limit: 0 },
            { limit: 1.5 },
            { limit: Number.NaN },
            { limit: 51 },
            { cursor: { updatedAt: "bad", id: actionMessageId.toString() } },
            { cursor: { updatedAt: new Date().toISOString(), id: "bad" } },
            { cursor: { updatedAt: new Date().toISOString(), id: actionMessageId.toString(), extra: true } },
            { extra: true },
        ]) {
            assert.deepEqual(
                await runWithAuthenticatedRequest(ownerDid, () =>
                    followUpActions.listMessageFollowUpsAction(malformed),
                ),
                { success: false, message: "Invalid request" },
            );
        }
        const actionList = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.listMessageFollowUpsAction({ limit: 50 }),
        );
        assert.equal(actionList.success, true);
        assert.ok("items" in actionList);
        const actionListItem = actionList.items.find((item) => item.followUp.id === actionMark.followUp?._id);
        assert.equal(actionListItem?.message?.body, "Action message");
        assert.equal(Object.prototype.hasOwnProperty.call(actionListItem?.message || {}, "submissionId"), false);

        const publicCircleId = new ObjectId();
        const publicConversationId = new ObjectId();
        const secretCircleId = new ObjectId();
        const secretConversationId = new ObjectId();
        await Circles.insertMany([
            {
                _id: publicCircleId,
                circleType: "circle",
                moderationStatus: "active",
                visibility: "public",
                name: "Public group",
            },
            {
                _id: secretCircleId,
                circleType: "circle",
                moderationStatus: "active",
                visibility: "secret",
                name: "Secret group",
            },
        ] as any[]);
        await ChatConversations.insertMany([
            {
                _id: publicConversationId,
                type: "group",
                circleId: publicCircleId.toString(),
                participants: [ownerDid],
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                _id: secretConversationId,
                type: "group",
                circleId: secretCircleId.toString(),
                participants: [ownerDid],
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);
        await ChatRoomMembers.insertMany([
            { userDid: ownerDid, chatRoomId: publicConversationId.toString(), joinedAt: new Date(), status: "active" },
            { userDid: ownerDid, chatRoomId: secretConversationId.toString(), joinedAt: new Date(), status: "active" },
        ] as any[]);
        await Members.insertOne({ userDid: ownerDid, circleId: secretCircleId.toString() } as any);
        const publicMessageId = new ObjectId();
        const secretMessageId = new ObjectId();
        await ChatMessageDocs.insertMany([
            {
                _id: publicMessageId,
                conversationId: publicConversationId.toString(),
                senderDid: otherDid,
                body: "Public group message",
                createdAt: new Date(),
            },
            {
                _id: secretMessageId,
                conversationId: secretConversationId.toString(),
                senderDid: otherDid,
                body: "Secret group message",
                createdAt: new Date(),
            },
        ]);
        const publicMark = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.markMessageForFollowUpAction(publicMessageId.toString()),
        );
        const secretMark = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.markMessageForFollowUpAction(secretMessageId.toString()),
        );
        assert.equal(publicMark.success, true);
        assert.equal(secretMark.success, true);
        const authorizedGroupList = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.listMessageFollowUpsAction({ limit: 50 }),
        );
        assert.equal(authorizedGroupList.success, true);
        assert.ok("items" in authorizedGroupList);
        assert.equal(
            authorizedGroupList.items.find((item) => item.followUp.id === publicMark.followUp?._id)?.message
                ?.conversation.name,
            "Public group",
        );
        assert.equal(
            authorizedGroupList.items.find((item) => item.followUp.id === secretMark.followUp?._id)?.message
                ?.conversation.name,
            "Secret group",
        );

        const authorizedGroupStatuses = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.getMessageFollowUpStatusesAction([publicMessageId.toString(), secretMessageId.toString()]),
        );
        if (!authorizedGroupStatuses.success || !authorizedGroupStatuses.statuses) {
            assert.fail("Expected authorized group statuses");
        }
        assert.equal(authorizedGroupStatuses.statuses.length, 2);

        await ChatRoomMembers.updateOne(
            { userDid: ownerDid, chatRoomId: publicConversationId.toString() },
            { $set: { status: "removed" } },
        );
        await Members.deleteOne({ userDid: ownerDid, circleId: secretCircleId.toString() } as any);
        await ChatConversations.updateOne({ _id: new ObjectId(conversationId) }, { $pull: { participants: ownerDid } });
        const revokedActionList = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.listMessageFollowUpsAction({ limit: 50 }),
        );
        assert.equal(revokedActionList.success, true);
        assert.ok("items" in revokedActionList);
        const revokedIds = new Set(revokedActionList.items.map((item) => item.followUp.id));
        assert.equal(revokedIds.has(actionMark.followUp!._id), false);
        assert.equal(revokedIds.has(publicMark.followUp!._id), false);
        assert.equal(revokedIds.has(secretMark.followUp!._id), false);
        const revokedStatuses = await runWithAuthenticatedRequest(ownerDid, () =>
            followUpActions.getMessageFollowUpStatusesAction([
                actionMessageId.toString(),
                publicMessageId.toString(),
                secretMessageId.toString(),
            ]),
        );
        assert.deepEqual(revokedStatuses, { success: true, statuses: [] });

        await ChatMessageDocs.deleteOne({ _id: messageId });
        const deletedList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        const deletedItem = deletedList.items.find((item) => item.followUp.id === created._id);
        assert.equal(deletedItem?.message, null);
        assert.equal(deletedItem?.unavailableReason, "unavailable");
        assert.deepEqual(Object.keys(deletedItem?.followUp || {}).sort(), ["createdAt", "id", "note", "updatedAt"]);

        const topicId = new ObjectId();
        const replyId = new ObjectId();
        await ChatMessageDocs.insertMany([
            {
                _id: topicId,
                conversationId,
                senderDid: ownerDid,
                body: "Topic",
                createdAt: new Date(),
                thread: { title: "Secret topic", createdAt: new Date(), updatedAt: new Date(), replyCount: 1 },
            },
            {
                _id: replyId,
                conversationId,
                senderDid: otherDid,
                body: "Reply",
                createdAt: new Date(),
                threadId: topicId.toString(),
            },
        ]);
        const replyFollowUp = await markMessageForFollowUp(ownerDid, replyId.toString(), canRead);
        const starterFollowUp = await markMessageForFollowUp(ownerDid, topicId.toString(), canRead);
        assert.equal(replyFollowUp?.topicId, topicId.toString());
        assert.equal(starterFollowUp?.topicId, topicId.toString());
        const topicList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.deepEqual(topicList.items.find((item) => item.followUp.id === replyFollowUp?._id)?.message?.topic, {
            title: "Secret topic",
        });
        await ChatMessageDocs.updateOne({ _id: topicId }, { $set: { "thread.deletingAt": new Date() } } as any);
        const deletingTopicList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.equal(deletingTopicList.items.find((item) => item.followUp.id === starterFollowUp?._id)?.message, null);
        assert.equal(deletingTopicList.items.find((item) => item.followUp.id === replyFollowUp?._id)?.message, null);
        await ChatMessageDocs.deleteOne({ _id: topicId });
        const afterTopicDelete = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.equal(afterTopicDelete.items.find((item) => item.followUp.id === replyFollowUp?._id)?.message, null);

        allowedByDid.set(ownerDid, new Set());
        const revokedList = await listAuthorizedMessageFollowUps(ownerDid, { limit: 10 }, canRead);
        assert.deepEqual(revokedList.items, []);
        allowedByDid.set(ownerDid, new Set([conversationId]));

        allowedByDid.set(
            ownerDid,
            new Set([conversationId, publicConversationId.toString(), secretConversationId.toString()]),
        );
        for (let index = 0; index < 4; index += 1) {
            const id = new ObjectId();
            await ChatMessageDocs.insertOne({
                _id: id,
                conversationId,
                senderDid: otherDid,
                body: `Page ${index}`,
                createdAt: new Date(),
            });
            const followUp = await markMessageForFollowUp(ownerDid, id.toString(), canRead);
            await ChatMessageFollowUps.updateOne(
                { _id: new ObjectId(followUp!._id) },
                { $set: { updatedAt: new Date(`2025-03-0${index + 1}T00:00:00.000Z`) } },
            );
        }
        const firstPage = await listAuthorizedMessageFollowUps(ownerDid, { limit: 2 }, canRead);
        assert.equal(firstPage.items.length, 2);
        assert.ok(firstPage.nextCursor);
        const secondPage = await listAuthorizedMessageFollowUps(
            ownerDid,
            { limit: 2, cursor: firstPage.nextCursor },
            canRead,
        );
        assert.equal(secondPage.items.length, 2);
        assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.followUp.id)).size, 4);

        const inaccessibleConversationId = new ObjectId().toString();
        const inaccessibleFollowUps = [0, 1].map((index) => ({
            ownerDid,
            messageId: new ObjectId().toString(),
            conversationId: inaccessibleConversationId,
            createdAt: new Date(`2099-01-0${index + 1}T00:00:00.000Z`),
            updatedAt: new Date(`2099-01-0${index + 1}T00:00:00.000Z`),
        }));
        await ChatMessageFollowUps.insertMany(inaccessibleFollowUps);
        const emptyAuthorizedPage = await listAuthorizedMessageFollowUps(ownerDid, { limit: 1 }, canRead);
        assert.deepEqual(emptyAuthorizedPage.items, []);
        assert.ok(emptyAuthorizedPage.nextCursor, "an authorization-filtered empty page must remain pageable");
        await ChatMessageFollowUps.deleteMany({ conversationId: inaccessibleConversationId });

        assert.equal(
            (await ChatConversations.findOne({ _id: new ObjectId(conversationId) }))?.updatedAt?.toISOString(),
            originalConversationTime.toISOString(),
        );
        assert.equal(await ChatReadStates.countDocuments({ userDid: ownerDid }), 1);
        assert.equal(await ChatTopicReadStates.countDocuments({}), 0);
        assert.equal(await Notifications.countDocuments({}), 0);

        await assert.rejects(
            ChatMessageFollowUps.insertOne({
                ownerDid,
                messageId: replyId.toString(),
                conversationId,
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
            (error: any) => error?.code === 11000,
        );
        console.log("message follow-up Mongo tests passed");
    } finally {
        nextHeaders.cookies = productionCookies;
        await db.dropDatabase();
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
