import assert from "node:assert/strict";
import { ObjectId } from "mongodb";

const databaseName = process.env.CIRCLES_MONGODB_DATABASE || "";
const mongoUri = process.env.MONGODB_URI || "";
if (process.env.NODE_ENV !== "test") throw new Error("Refusing Mongo regression test outside NODE_ENV=test");
if (!/^circles_stage1a_test_composed_message_[a-z0-9_-]+$/i.test(databaseName)) {
    throw new Error("Refusing non-disposable database");
}
const mongoUrl = new URL(mongoUri);
if (!["127.0.0.1", "localhost"].includes(mongoUrl.hostname)) throw new Error("Refusing non-local MongoDB");
if (mongoUrl.port !== "27028") throw new Error("Refusing non-disposable MongoDB port");

async function main() {
    process.env.CIRCLES_JWT_SECRET ||= "composed-message-test-secret";
    const { ChatConversations, ChatMessageDocs, Circles, client, db, ensureRequiredChatIndexes } = await import(
        "@/lib/data/db"
    );
    const { createThread } = await import("@/lib/data/mongo-chat");
    const { runWithChatActionContext } = await import("./chat-action-context");
    const { sendComposedMessageAction } = await import("@/components/modules/chat/mongo-actions");

    try {
        await db.dropDatabase();
        await ensureRequiredChatIndexes();
        const senderDid = "did:composed-sender";
        const circleId = new ObjectId();
        const conversationId = new ObjectId();
        await Circles.insertOne({
            _id: circleId,
            did: senderDid,
            circleType: "circle",
            moderationStatus: "active",
        } as any);
        await ChatConversations.insertOne({
            _id: conversationId,
            type: "group",
            circleId: circleId.toString(),
            participants: [senderDid],
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });

        const uploaded: string[] = [];
        const deleted: string[] = [];
        const storedObjects = new Set<string>();
        let uploadSequence = 0;
        const context = {
            viewerDid: senderDid,
            findMessagingUser: async () => ({
                did: senderDid,
                circleType: "user",
                picture: { url: "/profile.png" },
                description: "Complete profile",
                isAdmin: true,
                isEmailVerified: true,
            }),
            findConversation: async () => ChatConversations.findOne({ _id: conversationId }),
            findCircle: async () => Circles.findOne({ _id: circleId }),
            findCanonicalMember: async () => ({ userDid: senderDid, circleId: circleId.toString() }),
            findChatMember: async () => ({ status: "active" }),
            findMessage: async (messageId: string) =>
                ChatMessageDocs.findOne({ _id: new ObjectId(messageId), conversationId: conversationId.toString() }),
            saveFile: async (file: File) => {
                const url = `/storage/${++uploadSequence}/${file.name}`;
                uploaded.push(url);
                storedObjects.add(url);
                return { url, fileName: `key-${uploadSequence}`, originalName: file.name };
            },
            deleteFile: async (url: string) => {
                deleted.push(url);
                storedObjects.delete(url);
            },
            notifyMessage: async () => undefined,
        };

        const ordinary = new FormData();
        ordinary.set("roomId", conversationId.toString());
        ordinary.set("body", "Text with files");
        ordinary.set("submissionId", "ordinary-submission-1");
        ordinary.append("files", new File(["one"], "one.txt", { type: "text/plain" }));
        ordinary.append("files", new File(["two"], "two.txt", { type: "text/plain" }));
        const ordinaryResult = await runWithChatActionContext(context, () => sendComposedMessageAction(ordinary));
        assert.equal(ordinaryResult.success, true);
        const ordinaryDoc = await ChatMessageDocs.findOne({ _id: new ObjectId(ordinaryResult.messageId) });
        assert.equal(ordinaryDoc?.body, "Text with files");
        assert.equal(ordinaryDoc?.attachments?.length, 2);
        assert.ok((await ChatConversations.findOne({ _id: conversationId }))!.updatedAt!.getTime() > 0);

        const retryResult = await runWithChatActionContext(context, () => sendComposedMessageAction(ordinary));
        assert.equal(retryResult.success, true, retryResult.message);
        assert.equal(retryResult.messageId, ordinaryResult.messageId);
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "ordinary-submission-1" }), 1);
        assert.equal(uploaded.length, 2);
        assert.deepEqual(deleted, []);

        const topic = await createThread(conversationId.toString(), senderDid, "Topic", "Starter", []);
        assert.ok(topic?._id);
        const beforeTopicReply = (await ChatMessageDocs.findOne({ _id: new ObjectId(topic!._id) }))!.thread!.updatedAt;
        const topicReply = new FormData();
        topicReply.set("roomId", conversationId.toString());
        topicReply.set("threadId", topic!._id!.toString());
        topicReply.set("body", "Topic reply with file");
        topicReply.set("replyToMessageId", ordinaryResult.messageId!);
        topicReply.set("submissionId", "topic-submission-1");
        topicReply.append("files", new File(["topic"], "topic.txt", { type: "text/plain" }));
        const topicResult = await runWithChatActionContext(context, () => sendComposedMessageAction(topicReply));
        assert.equal(topicResult.success, true);
        const topicDoc = await ChatMessageDocs.findOne({ _id: new ObjectId(topicResult.messageId) });
        assert.equal(topicDoc?.threadId, topic!._id!.toString());
        assert.equal(topicDoc?.replyToMessageId, ordinaryResult.messageId);
        assert.equal(topicDoc?.attachments?.length, 1);
        const updatedTopic = await ChatMessageDocs.findOne({ _id: new ObjectId(topic!._id) });
        assert.ok(updatedTopic!.thread!.updatedAt.getTime() >= beforeTopicReply.getTime());

        const topicRetry = await runWithChatActionContext(context, () => sendComposedMessageAction(topicReply));
        assert.equal(topicRetry.messageId, topicResult.messageId);
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "topic-submission-1" }), 1);
        assert.equal(uploaded.length, 3);

        const withOneUpdateFailure = async (
            collection: any,
            shouldFail: (filter: any, update: any) => boolean,
            callback: () => Promise<void>,
        ) => {
            const hadOwnMethod = Object.prototype.hasOwnProperty.call(collection, "updateOne");
            const original = collection.updateOne;
            let injected = false;
            Object.defineProperty(collection, "updateOne", {
                configurable: true,
                writable: true,
                value: async function (filter: any, update: any, ...args: any[]) {
                    if (!injected && shouldFail(filter, update)) {
                        injected = true;
                        throw new Error("injected activity timestamp failure");
                    }
                    return original.call(collection, filter, update, ...args);
                },
            });
            try {
                await callback();
                assert.equal(injected, true, "expected activity failure to be injected");
            } finally {
                if (hadOwnMethod) {
                    Object.defineProperty(collection, "updateOne", {
                        configurable: true,
                        writable: true,
                        value: original,
                    });
                } else {
                    delete collection.updateOne;
                }
            }
        };

        const ordinaryAfterActivityFailure = new FormData();
        ordinaryAfterActivityFailure.set("roomId", conversationId.toString());
        ordinaryAfterActivityFailure.set("body", "Persisted before activity failure");
        ordinaryAfterActivityFailure.set("submissionId", "ordinary-partial-1");
        ordinaryAfterActivityFailure.append("files", new File(["keep me"], "ordinary-partial.txt"));
        const beforeOrdinaryFailureUploads = uploaded.length;
        await withOneUpdateFailure(
            ChatConversations,
            (_filter, update) => !!update?.$set?.updatedAt,
            async () => {
                const failed = await runWithChatActionContext(context, () =>
                    sendComposedMessageAction(ordinaryAfterActivityFailure),
                );
                assert.equal(failed.success, false);
                assert.match(failed.message || "", /saved/);
            },
        );
        const partialOrdinary = await ChatMessageDocs.findOne({ submissionId: "ordinary-partial-1" });
        assert.ok(partialOrdinary?._id);
        assert.ok(partialOrdinary?.attachments?.every((attachment) => storedObjects.has(attachment.url)));
        assert.equal(uploaded.length, beforeOrdinaryFailureUploads + 1);
        assert.equal(deleted.length, 0);
        const recoveredOrdinary = await runWithChatActionContext(context, () =>
            sendComposedMessageAction(ordinaryAfterActivityFailure),
        );
        assert.equal(recoveredOrdinary.success, true);
        assert.equal(recoveredOrdinary.messageId, partialOrdinary!._id!.toString());
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "ordinary-partial-1" }), 1);
        assert.ok((await ChatConversations.findOne({ _id: conversationId }))!.updatedAt!.getTime() > 0);

        const withPostInsertFailure = async (
            collection: any,
            shouldFail: (document: any) => boolean,
            callback: () => Promise<void>,
        ) => {
            const hadOwnMethod = Object.prototype.hasOwnProperty.call(collection, "insertOne");
            const original = collection.insertOne;
            let injected = false;
            Object.defineProperty(collection, "insertOne", {
                configurable: true,
                writable: true,
                value: async function (document: any, ...args: any[]) {
                    const result = await original.call(collection, document, ...args);
                    if (!injected && shouldFail(document)) {
                        injected = true;
                        throw new Error("injected lost insert acknowledgement");
                    }
                    return result;
                },
            });
            try {
                await callback();
                assert.equal(injected, true, "expected post-insert failure to be injected");
            } finally {
                if (hadOwnMethod) {
                    Object.defineProperty(collection, "insertOne", {
                        configurable: true,
                        writable: true,
                        value: original,
                    });
                } else {
                    delete collection.insertOne;
                }
            }
        };
        const ordinaryAfterLostAcknowledgement = new FormData();
        ordinaryAfterLostAcknowledgement.set("roomId", conversationId.toString());
        ordinaryAfterLostAcknowledgement.set("body", "Insert acknowledged after persistence");
        ordinaryAfterLostAcknowledgement.set("submissionId", "ordinary-ambiguous-1");
        ordinaryAfterLostAcknowledgement.append("files", new File(["retain"], "ordinary-ambiguous.txt"));
        const beforeAmbiguousUploads = uploaded.length;
        await withPostInsertFailure(
            ChatMessageDocs,
            (document) => document.submissionId === "ordinary-ambiguous-1",
            async () => {
                const recovered = await runWithChatActionContext(context, () =>
                    sendComposedMessageAction(ordinaryAfterLostAcknowledgement),
                );
                assert.equal(recovered.success, true);
                const recoveredDoc = await ChatMessageDocs.findOne({ submissionId: "ordinary-ambiguous-1" });
                assert.equal(recovered.messageId, recoveredDoc!._id.toString());
                assert.ok(recoveredDoc?.attachments?.every((attachment) => storedObjects.has(attachment.url)));
            },
        );
        assert.equal(uploaded.length, beforeAmbiguousUploads + 1);
        assert.equal(deleted.length, 0);
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "ordinary-ambiguous-1" }), 1);

        const topicAfterActivityFailure = new FormData();
        topicAfterActivityFailure.set("roomId", conversationId.toString());
        topicAfterActivityFailure.set("threadId", topic!._id!.toString());
        topicAfterActivityFailure.set("body", "Topic persisted before activity failure");
        topicAfterActivityFailure.set("submissionId", "topic-partial-1");
        topicAfterActivityFailure.append("files", new File(["keep me"], "topic-partial.txt"));
        const beforeTopicFailureUploads = uploaded.length;
        await withOneUpdateFailure(
            ChatMessageDocs,
            (filter, update) =>
                String(filter?._id) === topic!._id!.toString() && !!update?.$set?.["thread.updatedAt"],
            async () => {
                const failed = await runWithChatActionContext(context, () =>
                    sendComposedMessageAction(topicAfterActivityFailure),
                );
                assert.equal(failed.success, false);
                assert.match(failed.message || "", /saved/);
            },
        );
        const partialTopicReply = await ChatMessageDocs.findOne({ submissionId: "topic-partial-1" });
        assert.ok(partialTopicReply?._id);
        assert.ok(partialTopicReply?.attachments?.every((attachment) => storedObjects.has(attachment.url)));
        assert.equal(uploaded.length, beforeTopicFailureUploads + 1);
        assert.equal(deleted.length, 0);
        const recoveredTopic = await runWithChatActionContext(context, () =>
            sendComposedMessageAction(topicAfterActivityFailure),
        );
        assert.equal(recoveredTopic.success, true);
        assert.equal(recoveredTopic.messageId, partialTopicReply!._id!.toString());
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "topic-partial-1" }), 1);
        const repairedTopic = await ChatMessageDocs.findOne({ _id: new ObjectId(topic!._id) });
        assert.equal(repairedTopic!.thread!.replyCount, 2);
        assert.ok(repairedTopic!.thread!.updatedAt.getTime() > beforeTopicReply.getTime());

        let startedUploads = 0;
        let releaseUploads!: () => void;
        const uploadBarrier = new Promise<void>((resolve) => {
            releaseUploads = resolve;
        });
        const concurrentContext = {
            ...context,
            saveFile: async (file: File) => {
                const sequence = ++uploadSequence;
                const url = `/storage/${sequence}/${file.name}`;
                uploaded.push(url);
                storedObjects.add(url);
                startedUploads++;
                if (startedUploads === 2) releaseUploads();
                await uploadBarrier;
                return { url, fileName: `key-${sequence}`, originalName: file.name };
            },
        };
        const makeConcurrentForm = () => {
            const data = new FormData();
            data.set("roomId", conversationId.toString());
            data.set("body", "Concurrent composed retry");
            data.set("submissionId", "concurrent-composed-1");
            data.append("files", new File(["same file"], "concurrent.txt"));
            return data;
        };
        const [concurrentA, concurrentB] = await Promise.all([
            runWithChatActionContext(concurrentContext, () => sendComposedMessageAction(makeConcurrentForm())),
            runWithChatActionContext(concurrentContext, () => sendComposedMessageAction(makeConcurrentForm())),
        ]);
        assert.equal(concurrentA.success, true);
        assert.equal(concurrentB.success, true);
        assert.equal(concurrentA.messageId, concurrentB.messageId);
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "concurrent-composed-1" }), 1);
        const concurrentDoc = await ChatMessageDocs.findOne({ submissionId: "concurrent-composed-1" });
        assert.ok(concurrentDoc?.attachments?.every((attachment) => storedObjects.has(attachment.url)));
        assert.equal(deleted.length, 1, "the losing retry upload should be rolled back");

        let topicStartedUploads = 0;
        let releaseTopicUploads!: () => void;
        const topicUploadBarrier = new Promise<void>((resolve) => {
            releaseTopicUploads = resolve;
        });
        const concurrentTopicContext = {
            ...context,
            saveFile: async (file: File) => {
                const sequence = ++uploadSequence;
                const url = `/storage/${sequence}/${file.name}`;
                uploaded.push(url);
                storedObjects.add(url);
                topicStartedUploads++;
                if (topicStartedUploads === 2) releaseTopicUploads();
                await topicUploadBarrier;
                return { url, fileName: `key-${sequence}`, originalName: file.name };
            },
        };
        const makeConcurrentTopicForm = () => {
            const data = new FormData();
            data.set("roomId", conversationId.toString());
            data.set("threadId", topic!._id!.toString());
            data.set("body", "Concurrent topic composed retry");
            data.set("submissionId", "concurrent-topic-1");
            data.append("files", new File(["same topic file"], "concurrent-topic.txt"));
            return data;
        };
        const [concurrentTopicA, concurrentTopicB] = await Promise.all([
            runWithChatActionContext(concurrentTopicContext, () =>
                sendComposedMessageAction(makeConcurrentTopicForm()),
            ),
            runWithChatActionContext(concurrentTopicContext, () =>
                sendComposedMessageAction(makeConcurrentTopicForm()),
            ),
        ]);
        assert.equal(concurrentTopicA.success, true);
        assert.equal(concurrentTopicB.success, true);
        assert.equal(concurrentTopicA.messageId, concurrentTopicB.messageId);
        assert.equal(await ChatMessageDocs.countDocuments({ submissionId: "concurrent-topic-1" }), 1);
        const concurrentTopicDoc = await ChatMessageDocs.findOne({ submissionId: "concurrent-topic-1" });
        assert.ok(concurrentTopicDoc?.attachments?.every((attachment) => storedObjects.has(attachment.url)));
        assert.equal(deleted.length, 2, "each losing retry upload should be rolled back");
        const concurrentTopicStarter = await ChatMessageDocs.findOne({ _id: new ObjectId(topic!._id) });
        assert.equal(concurrentTopicStarter!.thread!.replyCount, 3);

        console.log("composed-message Mongo tests passed");
    } finally {
        await db.dropDatabase();
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
