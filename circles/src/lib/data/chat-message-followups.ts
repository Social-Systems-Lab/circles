import { ObjectId, type Collection, type Filter } from "mongodb";
import type { ChatMessageDoc, ChatMessageFollowUp } from "@/lib/chat/mongo-types";
import type { Circle } from "@/models/models";
import { ChatMessageDocs, ChatMessageFollowUps, Circles } from "./db";

export const CHAT_FOLLOW_UP_UNAVAILABLE = "Follow-up unavailable";
export const CHAT_FOLLOW_UP_NOTE_MAX_LENGTH = 4000;
export const CHAT_FOLLOW_UP_PAGE_MAX = 50;

export type ChatFollowUpCursor = { updatedAt: string; id: string };
export type ChatFollowUpListOptions = { completed?: boolean; limit?: number; cursor?: ChatFollowUpCursor };
export type ChatFollowUpMessagePresentation = {
    id: string;
    conversationId: string;
    topicId?: string;
    sender: { did: string; name?: string; handle?: string; avatarUrl?: string };
    body: string;
    createdAt: Date;
    editedAt?: Date;
    attachments: Array<{ name: string; url: string; mimeType?: string; size?: number }>;
};
export type ChatFollowUpListItem = {
    followUp: ChatMessageFollowUp & { _id: string };
    message: ChatFollowUpMessagePresentation | null;
    unavailableReason?: "deleted";
};

type FollowUpDependencies = {
    followUps: Collection<ChatMessageFollowUp>;
    messages: Collection<ChatMessageDoc>;
    senders: Collection<Circle>;
    canReadConversations(ownerDid: string, conversationIds: string[]): Promise<Set<string>>;
};

const defaultDependencies = (
    canReadConversations: FollowUpDependencies["canReadConversations"],
): FollowUpDependencies => ({
    followUps: ChatMessageFollowUps,
    messages: ChatMessageDocs,
    senders: Circles,
    canReadConversations,
});

const normalizeId = (value: string): string | null => {
    if (!ObjectId.isValid(value)) return null;
    return new ObjectId(value).toHexString();
};

const normalizeNote = (note: string): string => {
    if (typeof note !== "string") throw new Error("Invalid private note");
    if (note.length > CHAT_FOLLOW_UP_NOTE_MAX_LENGTH) throw new Error("Private note is too long");
    return note.trim();
};

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));

export const parseChatFollowUpListOptions = (
    value: unknown,
): { success: true; options: ChatFollowUpListOptions } | { success: false } => {
    if (value === undefined) return { success: true, options: {} };
    if (!value || typeof value !== "object" || Array.isArray(value)) return { success: false };
    const input = value as Record<string, unknown>;
    if (!hasOnlyKeys(input, ["completed", "limit", "cursor"])) return { success: false };
    if (input.completed !== undefined && typeof input.completed !== "boolean") return { success: false };
    if (
        input.limit !== undefined &&
        (typeof input.limit !== "number" ||
            !Number.isFinite(input.limit) ||
            !Number.isInteger(input.limit) ||
            input.limit < 1 ||
            input.limit > CHAT_FOLLOW_UP_PAGE_MAX)
    ) {
        return { success: false };
    }
    if (input.cursor !== undefined) {
        if (!input.cursor || typeof input.cursor !== "object" || Array.isArray(input.cursor)) return { success: false };
        const cursor = input.cursor as Record<string, unknown>;
        if (!hasOnlyKeys(cursor, ["updatedAt", "id"]) || Object.keys(cursor).length !== 2) return { success: false };
        if (typeof cursor.updatedAt !== "string" || typeof cursor.id !== "string") return { success: false };
        if (!/^[0-9a-fA-F]{24}$/.test(cursor.id)) return { success: false };
        const updatedAt = new Date(cursor.updatedAt);
        if (Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString() !== cursor.updatedAt)
            return { success: false };
    }
    return {
        success: true,
        options: {
            ...(input.completed !== undefined ? { completed: input.completed as boolean } : {}),
            ...(input.limit !== undefined ? { limit: input.limit as number } : {}),
            ...(input.cursor !== undefined ? { cursor: input.cursor as ChatFollowUpCursor } : {}),
        },
    };
};

const serializeFollowUp = (followUp: ChatMessageFollowUp): ChatMessageFollowUp & { _id: string } => ({
    ...followUp,
    _id: followUp._id.toString(),
});

const loadValidTarget = async (
    ownerDid: string,
    messageId: string,
    dependencies: FollowUpDependencies,
): Promise<{ message: ChatMessageDoc; messageId: string; topicId?: string } | null> => {
    const normalizedMessageId = normalizeId(messageId);
    if (!normalizedMessageId) return null;
    const message = await dependencies.messages.findOne({ _id: new ObjectId(normalizedMessageId) });
    if (!message?.conversationId) return null;
    const allowed = await dependencies.canReadConversations(ownerDid, [message.conversationId]);
    if (!allowed.has(message.conversationId)) return null;

    const topicId = message.threadId || (message.thread ? normalizedMessageId : undefined);
    if (topicId && message.threadId) {
        const topic = await dependencies.messages.findOne({
            _id: new ObjectId(topicId),
            conversationId: message.conversationId,
            thread: { $exists: true },
            "thread.deletingAt": { $exists: false },
        } as Filter<ChatMessageDoc>);
        if (!topic) return null;
    }
    return { message, messageId: normalizedMessageId, topicId };
};

export async function markMessageForFollowUp(
    ownerDid: string,
    messageId: string,
    canReadConversations: FollowUpDependencies["canReadConversations"],
    dependencies = defaultDependencies(canReadConversations),
): Promise<(ChatMessageFollowUp & { _id: string }) | null> {
    const target = await loadValidTarget(ownerDid, messageId, dependencies);
    if (!target) return null;
    const now = new Date();
    try {
        await dependencies.followUps.updateOne(
            { ownerDid, messageId: target.messageId },
            {
                $setOnInsert: {
                    ownerDid,
                    messageId: target.messageId,
                    conversationId: target.message.conversationId,
                    ...(target.topicId ? { topicId: target.topicId } : {}),
                    createdAt: now,
                    updatedAt: now,
                },
            },
            { upsert: true },
        );
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
    }
    const followUp = await dependencies.followUps.findOne({ ownerDid, messageId: target.messageId });
    return followUp ? serializeFollowUp(followUp) : null;
}

export async function updateFollowUpNote(
    ownerDid: string,
    followUpId: string,
    note: string,
    dependencies: Pick<FollowUpDependencies, "followUps"> = { followUps: ChatMessageFollowUps },
): Promise<boolean> {
    const normalizedId = normalizeId(followUpId);
    if (!normalizedId) return false;
    const normalizedNote = normalizeNote(note);
    const result = await dependencies.followUps.updateOne(
        { _id: new ObjectId(normalizedId), ownerDid },
        normalizedNote
            ? { $set: { note: normalizedNote, updatedAt: new Date() } }
            : { $unset: { note: "" }, $set: { updatedAt: new Date() } },
    );
    return result.matchedCount === 1;
}

export async function setFollowUpCompleted(
    ownerDid: string,
    followUpId: string,
    completed: boolean,
    dependencies: Pick<FollowUpDependencies, "followUps"> = { followUps: ChatMessageFollowUps },
): Promise<boolean> {
    const normalizedId = normalizeId(followUpId);
    if (!normalizedId) return false;
    const now = new Date();
    const identity = { _id: new ObjectId(normalizedId), ownerDid };
    const result = await dependencies.followUps.updateOne(
        completed ? { ...identity, completedAt: { $exists: false } } : { ...identity, completedAt: { $exists: true } },
        completed
            ? { $set: { completedAt: now, updatedAt: now } }
            : { $unset: { completedAt: "" }, $set: { updatedAt: now } },
    );
    if (result.matchedCount === 1) return true;
    return Boolean(await dependencies.followUps.findOne(identity, { projection: { _id: 1 } }));
}

const buildCursorFilter = (cursor?: ChatFollowUpCursor): Filter<ChatMessageFollowUp> => {
    if (!cursor || !ObjectId.isValid(cursor.id)) return {};
    const updatedAt = new Date(cursor.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return {};
    return {
        $or: [{ updatedAt: { $lt: updatedAt } }, { updatedAt, _id: { $lt: new ObjectId(cursor.id) } }],
    };
};

export async function listAuthorizedMessageFollowUps(
    ownerDid: string,
    options: ChatFollowUpListOptions,
    canReadConversations: FollowUpDependencies["canReadConversations"],
    dependencies = defaultDependencies(canReadConversations),
): Promise<{ items: ChatFollowUpListItem[]; nextCursor?: ChatFollowUpCursor }> {
    const limit = options.limit ?? 25;
    const statusFilter: Filter<ChatMessageFollowUp> = options.completed
        ? { completedAt: { $type: "date" } }
        : { completedAt: { $exists: false } };
    const records = await dependencies.followUps
        .find({ ownerDid, ...statusFilter, ...buildCursorFilter(options.cursor) })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
    const page = records.slice(0, limit);
    const conversationIds = Array.from(new Set(page.map((record) => record.conversationId)));
    const allowed = await dependencies.canReadConversations(ownerDid, conversationIds);
    const visibleRecords = page.filter((record) => allowed.has(record.conversationId));
    const messageIds = visibleRecords.map((record) => new ObjectId(record.messageId));
    const messages = messageIds.length ? await dependencies.messages.find({ _id: { $in: messageIds } }).toArray() : [];
    const messageById = new Map(messages.map((message) => [message._id.toString(), message]));
    const senderDids = Array.from(new Set(messages.map((message) => message.senderDid)));
    const senders = senderDids.length
        ? await dependencies.senders
              .find({ did: { $in: senderDids } }, { projection: { did: 1, name: 1, handle: 1, "picture.url": 1 } })
              .toArray()
        : [];
    const senderByDid = new Map(senders.map((sender) => [sender.did, sender]));
    const topicIds = Array.from(
        new Set(messages.map((message) => message.threadId).filter((topicId): topicId is string => !!topicId)),
    );
    const existingTopics = topicIds.length
        ? await dependencies.messages
              .find({
                  _id: { $in: topicIds.map((topicId) => new ObjectId(topicId)) },
                  thread: { $exists: true },
                  "thread.deletingAt": { $exists: false },
              } as Filter<ChatMessageDoc>)
              .toArray()
        : [];
    const existingTopicIds = new Set(existingTopics.map((topic) => topic._id.toString()));
    const items = visibleRecords.map((followUp) => {
        const message = messageById.get(followUp.messageId);
        const validMessage =
            message?.conversationId === followUp.conversationId &&
            (!message.threadId || (message.threadId === followUp.topicId && existingTopicIds.has(message.threadId)))
                ? message
                : null;
        const sender = validMessage ? senderByDid.get(validMessage.senderDid) : undefined;
        return {
            followUp: serializeFollowUp(followUp),
            message: validMessage
                ? {
                      id: validMessage._id.toString(),
                      conversationId: followUp.conversationId,
                      ...(followUp.topicId ? { topicId: followUp.topicId } : {}),
                      sender: {
                          did: validMessage.senderDid,
                          ...(sender?.name ? { name: sender.name } : {}),
                          ...(sender?.handle ? { handle: sender.handle } : {}),
                          ...(sender?.picture?.url ? { avatarUrl: sender.picture.url } : {}),
                      },
                      body: validMessage.body,
                      createdAt: validMessage.createdAt,
                      ...(validMessage.editedAt ? { editedAt: validMessage.editedAt } : {}),
                      attachments: (validMessage.attachments || []).map((attachment) => ({
                          name: attachment.name,
                          url: attachment.url,
                          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
                          ...(typeof attachment.size === "number" ? { size: attachment.size } : {}),
                      })),
                  }
                : null,
            ...(validMessage ? {} : { unavailableReason: "deleted" as const }),
        };
    });
    const last = page[page.length - 1];
    return {
        items,
        ...(records.length > limit && last
            ? { nextCursor: { updatedAt: last.updatedAt.toISOString(), id: last._id.toString() } }
            : {}),
    };
}
