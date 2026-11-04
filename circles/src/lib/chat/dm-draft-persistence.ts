import { ObjectId } from "mongodb";
import { ChatConversations, ChatMessageDocs, ChatTopicDrafts, ChatTopicDraftTombstones } from "@/lib/data/db";
import { allocateDmIds } from "./dm-drafts";
import { resolveCanonicalDm } from "./canonical-dm";
import { processFirstTopicNotifications } from "./first-topic-notifications";

export async function reconcilePublishedDmDraft(authorDid: string, recipientDid: string, generation: string) {
    const topic = await ChatMessageDocs.findOne({
        senderDid: authorDid,
        draftGeneration: generation,
        thread: { $exists: true },
    });
    if (!topic || !ObjectId.isValid(topic.conversationId)) return false;
    const conversation = await ChatConversations.findOne({
        _id: new ObjectId(topic.conversationId),
        type: "dm",
        participants: { $all: [authorDid, recipientDid], $size: 2 },
    });
    if (!conversation) return false;
    await ChatTopicDraftTombstones.updateOne(
        { authorDid, recipientDid, generation },
        { $setOnInsert: { authorDid, recipientDid, generation, reason: "consumed", createdAt: new Date() } },
        { upsert: true },
    );
    await ChatTopicDrafts.updateOne(
        { authorDid, recipientDid, generation, state: "active" },
        { $set: { state: "consumed", revision: Number.MAX_SAFE_INTEGER, updatedAt: new Date() } },
    );
    return true;
}

export async function saveDmDraftRecord(input: {
    authorDid: string;
    recipientDid: string;
    title: string;
    body: string;
    hashtags: string[];
    revision: number;
    generation: string;
    entryKind: "composer" | "profile";
}) {
    const key = { authorDid: input.authorDid, recipientDid: input.recipientDid };
    if (await ChatTopicDraftTombstones.findOne({ ...key, generation: input.generation }))
        return { saved: false, stale: true };
    const existing = await ChatTopicDrafts.findOne(key);
    const now = new Date();
    try {
        const result = await ChatTopicDrafts.updateOne(
            {
                ...key,
                $or: [
                    { generation: input.generation, state: "active", revision: { $lt: input.revision } },
                    { state: { $in: ["discarded", "consumed"] }, generation: { $ne: input.generation } },
                ],
            },
            {
                $set: {
                    title: input.title,
                    body: input.body,
                    hashtags: input.hashtags,
                    revision: input.revision,
                    generation: input.generation,
                    entryKind: input.entryKind,
                    state: "active",
                    updatedAt: now,
                },
                $setOnInsert: { ...key, createdAt: now },
            },
            { upsert: !existing },
        );
        const tombstone = await ChatTopicDraftTombstones.findOne({ ...key, generation: input.generation });
        if (tombstone) {
            await ChatTopicDrafts.updateOne(
                { ...key, generation: input.generation },
                { $set: { state: tombstone.reason, revision: Number.MAX_SAFE_INTEGER, updatedAt: new Date() } },
            );
            return { saved: false, stale: true };
        }
        return {
            saved: result.matchedCount > 0 || !!result.upsertedId,
            stale: result.matchedCount === 0 && !result.upsertedId,
        };
    } catch (error: any) {
        if (error?.code === 11000) return { saved: false, stale: true };
        throw error;
    }
}

export async function discardDmDraftRecord(authorDid: string, recipientDid: string, generation: string) {
    await ChatTopicDraftTombstones.updateOne(
        { authorDid, recipientDid, generation },
        { $setOnInsert: { authorDid, recipientDid, generation, reason: "discarded", createdAt: new Date() } },
        { upsert: true },
    );
    await ChatTopicDrafts.updateOne(
        { authorDid, recipientDid, generation, state: "active" },
        { $set: { state: "discarded", revision: Number.MAX_SAFE_INTEGER, updatedAt: new Date() } },
    );
}

export async function publishDmFirstTopic(input: {
    authorDid: string;
    recipientDid: string;
    title: string;
    body: string;
    hashtags: string[];
    generation: string;
    submissionId: string;
    processNotifications?: boolean;
}) {
    const ids = allocateDmIds(input.submissionId);
    const conversation = await resolveCanonicalDm(input.authorDid, input.recipientDid, {
        proposedConversationId: ids.conversationId,
        provisional: true,
        firstSubmissionId: input.submissionId,
    });
    const conversationId = conversation._id.toString();
    const now = new Date();
    await ChatMessageDocs.updateOne(
        { senderDid: input.authorDid, submissionId: input.submissionId },
        {
            $setOnInsert: {
                _id: ids.topicId,
                conversationId,
                senderDid: input.authorDid,
                submissionId: input.submissionId,
                draftGeneration: input.generation,
                body: input.body.trim(),
                createdAt: now,
                thread: {
                    title: input.title.trim(),
                    hashtags: input.hashtags,
                    createdAt: now,
                    updatedAt: now,
                    replyCount: 0,
                },
                firstTopicNotification: { state: "pending", attempts: 0 },
            },
        },
        { upsert: true },
    );
    const topic = await ChatMessageDocs.findOne({ senderDid: input.authorDid, submissionId: input.submissionId });
    if (!topic || topic.conversationId !== conversationId || topic.draftGeneration !== input.generation)
        throw new Error("Submission conflict");
    await ChatConversations.updateOne(
        { _id: new ObjectId(conversationId) },
        {
            $max: { updatedAt: topic.createdAt },
            $unset: { "metadata.dmProvisional": "" },
            $pull: { archivedBy: { $ne: input.authorDid } },
        },
    );
    await reconcilePublishedDmDraft(input.authorDid, input.recipientDid, input.generation);
    if (input.processNotifications !== false) await processFirstTopicNotifications(1, topic._id?.toString());
    return { conversationId, topicId: topic._id?.toString() };
}
