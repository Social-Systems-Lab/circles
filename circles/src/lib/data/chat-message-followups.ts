import { ObjectId, type Collection, type Filter } from "mongodb";
import type { ChatConversation, ChatMessageDoc, ChatMessageFollowUp } from "@/lib/chat/mongo-types";
import type { Circle } from "@/models/models";
import { ChatConversations, ChatMessageDocs, ChatMessageFollowUps, Circles } from "./db";

export const CHAT_FOLLOW_UP_UNAVAILABLE = "Follow-up unavailable";
export const CHAT_FOLLOW_UP_NOTE_MAX_LENGTH = 4000;
export const CHAT_FOLLOW_UP_PAGE_MAX = 50;
export const CHAT_FOLLOW_UP_STATUS_BATCH_MAX = 200;

export type ChatFollowUpCursor = { updatedAt: string; id: string };
export type ChatFollowUpListOptions = { completed?: boolean; limit?: number; cursor?: ChatFollowUpCursor };
export type ChatFollowUpMessagePresentation = {
    conversationId: string;
    topicId?: string;
    sender: { name?: string; handle?: string; avatarUrl?: string };
    body: string;
    createdAt: Date;
    editedAt?: Date;
    attachments: Array<{ name: string }>;
    conversation: { name: string; avatarUrl?: string };
    topic?: { title: string };
};
export type ChatFollowUpPresentation = {
    id: string;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
};
export type ChatFollowUpListItem = {
    followUp: ChatFollowUpPresentation;
    message: ChatFollowUpMessagePresentation | null;
    unavailableReason?: "unavailable";
};
export type ChatFollowUpStatus = { messageId: string; followUpId: string; completed: boolean };

type FollowUpDependencies = {
    followUps: Collection<ChatMessageFollowUp>;
    messages: Collection<ChatMessageDoc>;
    senders: Collection<Circle>;
    conversations: Collection<ChatConversation>;
    canReadConversations(ownerDid: string, conversationIds: string[]): Promise<Set<string>>;
};

const defaultDependencies = (
    canReadConversations: FollowUpDependencies["canReadConversations"],
): FollowUpDependencies => ({
    followUps: ChatMessageFollowUps,
    messages: ChatMessageDocs,
    senders: Circles,
    conversations: ChatConversations,
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

export const parseChatFollowUpStatusMessageIds = (
    value: unknown,
): { success: true; messageIds: string[] } | { success: false } => {
    if (!Array.isArray(value) || value.length > CHAT_FOLLOW_UP_STATUS_BATCH_MAX) return { success: false };
    if (value.some((messageId) => typeof messageId !== "string" || !/^[0-9a-fA-F]{24}$/.test(messageId))) {
        return { success: false };
    }
    return {
        success: true,
        messageIds: Array.from(new Set(value.map((messageId) => new ObjectId(messageId).toHexString()))),
    };
};

const serializeFollowUp = (followUp: ChatMessageFollowUp): ChatMessageFollowUp & { _id: string } => ({
    ...followUp,
    _id: followUp._id.toString(),
});

const presentFollowUp = (followUp: ChatMessageFollowUp): ChatFollowUpPresentation => ({
    id: followUp._id.toString(),
    ...(followUp.note ? { note: followUp.note } : {}),
    createdAt: followUp.createdAt,
    updatedAt: followUp.updatedAt,
    ...(followUp.completedAt ? { completedAt: followUp.completedAt } : {}),
});

const safeDmName = (value: string | undefined, participantDids: string[]): string | undefined => {
    const name = value?.trim();
    if (!name) return undefined;
    return name.startsWith("dm-") || participantDids.some((participantDid) => name.includes(participantDid))
        ? undefined
        : name;
};

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

export async function listAuthorizedMessageFollowUpStatuses(
    ownerDid: string,
    messageIds: string[],
    canReadConversations: FollowUpDependencies["canReadConversations"],
    dependencies = defaultDependencies(canReadConversations),
): Promise<ChatFollowUpStatus[]> {
    if (!messageIds.length) return [];
    const records = await dependencies.followUps
        .find(
            { ownerDid, messageId: { $in: messageIds } },
            { projection: { messageId: 1, conversationId: 1, completedAt: 1 } },
        )
        .toArray();
    const conversationIds = Array.from(new Set(records.map((record) => record.conversationId)));
    const allowed = await dependencies.canReadConversations(ownerDid, conversationIds);
    return records
        .filter((record) => allowed.has(record.conversationId))
        .map((record) => ({
            messageId: record.messageId,
            followUpId: record._id.toString(),
            completed: record.completedAt instanceof Date,
        }));
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
    const visibleConversationIds = Array.from(new Set(visibleRecords.map((record) => record.conversationId)));
    const visibleConversationObjectIds = visibleConversationIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const conversations = visibleConversationIds.length
        ? await dependencies.conversations
              .find(
                  {
                      $or: [
                          { _id: { $in: visibleConversationObjectIds } },
                          { handle: { $in: visibleConversationIds } },
                      ],
                  },
                  { projection: { type: 1, name: 1, picture: 1, handle: 1, participants: 1, circleId: 1 } },
              )
              .toArray()
        : [];
    const conversationById = new Map(
        conversations.flatMap((conversation) => [
            [conversation._id.toString(), conversation] as const,
            ...(conversation.handle ? ([[conversation.handle, conversation]] as const) : []),
        ]),
    );
    const messageIds = visibleRecords.map((record) => new ObjectId(record.messageId));
    const messages = messageIds.length ? await dependencies.messages.find({ _id: { $in: messageIds } }).toArray() : [];
    const messageById = new Map(messages.map((message) => [message._id.toString(), message]));
    const senderDids = messages.map((message) => message.senderDid);
    const dmParticipantDids = conversations.flatMap((conversation) =>
        conversation.type === "dm"
            ? conversation.participants.filter((participantDid) => participantDid !== ownerDid)
            : [],
    );
    const presentationDids = Array.from(new Set([...senderDids, ...dmParticipantDids]));
    const circleObjectIds = Array.from(
        new Set(
            conversations
                .map((conversation) => conversation.circleId)
                .filter((circleId): circleId is string => !!circleId && ObjectId.isValid(circleId)),
        ),
    ).map((circleId) => new ObjectId(circleId));
    const presenters =
        presentationDids.length || circleObjectIds.length
            ? await dependencies.senders
                  .find(
                      {
                          $or: [
                              { did: { $in: presentationDids } },
                              ...((circleObjectIds.length
                                  ? [{ _id: { $in: circleObjectIds } }]
                                  : []) as Filter<Circle>[]),
                          ],
                      },
                      { projection: { did: 1, name: 1, handle: 1, "picture.url": 1 } },
                  )
                  .toArray()
            : [];
    const presenterByDid = new Map(
        presenters.filter((presenter) => presenter.did).map((presenter) => [presenter.did!, presenter]),
    );
    const presenterById = new Map(presenters.map((presenter) => [presenter._id.toString(), presenter]));
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
    const topicById = new Map(existingTopics.map((topic) => [topic._id.toString(), topic]));
    const items = visibleRecords.map((followUp) => {
        const message = messageById.get(followUp.messageId);
        const validMessage =
            message?.conversationId === followUp.conversationId &&
            !(message.thread && "deletingAt" in message.thread) &&
            (!message.threadId || (message.threadId === followUp.topicId && existingTopicIds.has(message.threadId)))
                ? message
                : null;
        const sender = validMessage ? presenterByDid.get(validMessage.senderDid) : undefined;
        const conversation = validMessage ? conversationById.get(followUp.conversationId) : undefined;
        const topic = validMessage?.threadId ? topicById.get(validMessage.threadId) : validMessage;
        const otherParticipant =
            conversation?.type === "dm"
                ? presenterByDid.get(
                      conversation.participants.find((participantDid) => participantDid !== ownerDid) || "",
                  )
                : undefined;
        const ownerCircle = conversation?.circleId ? presenterById.get(conversation.circleId) : undefined;
        const conversationName =
            conversation?.type === "dm"
                ? safeDmName(otherParticipant?.name, conversation.participants) ||
                  safeDmName(conversation.name, conversation.participants) ||
                  "Direct message"
                : ownerCircle?.name?.trim() || conversation?.name?.trim() || "Conversation";
        const conversationAvatarUrl =
            conversation?.type === "dm"
                ? otherParticipant?.picture?.url || conversation.picture?.url
                : ownerCircle?.picture?.url || conversation?.picture?.url;
        return {
            followUp: presentFollowUp(followUp),
            message: validMessage
                ? {
                      conversationId: followUp.conversationId,
                      ...(followUp.topicId ? { topicId: followUp.topicId } : {}),
                      sender: {
                          ...(sender?.name ? { name: sender.name } : {}),
                          ...(sender?.handle ? { handle: sender.handle } : {}),
                          ...(sender?.picture?.url ? { avatarUrl: sender.picture.url } : {}),
                      },
                      body: validMessage.body,
                      createdAt: validMessage.createdAt,
                      ...(validMessage.editedAt ? { editedAt: validMessage.editedAt } : {}),
                      attachments: (validMessage.attachments || []).map((attachment) => ({ name: attachment.name })),
                      conversation: {
                          name: conversationName,
                          ...(conversationAvatarUrl ? { avatarUrl: conversationAvatarUrl } : {}),
                      },
                      ...(followUp.topicId && topic?.thread?.title?.trim()
                          ? { topic: { title: topic.thread.title.trim() } }
                          : {}),
                  }
                : null,
            ...(validMessage ? {} : { unavailableReason: "unavailable" as const }),
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
