import { ObjectId } from "mongodb";
import { ChatConversation } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, Circles, PlatformBroadcastMessages } from "./db";

export type PlatformBroadcastMessage = {
    _id?: any;
    body: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type PlatformBroadcastMessageDisplay = Omit<PlatformBroadcastMessage, "_id"> & {
    id: string;
};

export const PLATFORM_ANNOUNCEMENT_HANDLE = "kamooni-announcements";
export const PLATFORM_ANNOUNCEMENT_TITLE = "Kamooni Announcements";
export const PLATFORM_ANNOUNCEMENT_SYSTEM_TYPE = "announcement" as const;
export const PLATFORM_ANNOUNCEMENT_SOURCE = "platform_admin" as const;
export const PLATFORM_ANNOUNCEMENT_SENDER_DID = "system:platform_admin";

const toObjectId = (value: string): ObjectId | null => {
    if (!ObjectId.isValid(value)) return null;
    return new ObjectId(value);
};

const normalizeBroadcast = (broadcast: PlatformBroadcastMessage): PlatformBroadcastMessageDisplay => {
    const id = broadcast?._id ? String(broadcast._id) : "";
    return {
        id,
        body: broadcast.body || "",
        active: broadcast.active === true,
        createdAt: broadcast.createdAt || new Date(),
        updatedAt: broadcast.updatedAt || new Date(),
    };
};

const normalizeConversation = (conversation: ChatConversation): ChatConversation => {
    if (conversation?._id) {
        conversation._id = String(conversation._id);
    }
    return conversation;
};

const isPlatformAnnouncementMessage = (doc: any, body: string) => {
    const system = (doc?.system || {}) as Record<string, unknown>;
    return (
        doc?.body === body &&
        doc?.format === "markdown" &&
        (system.repliesDisabled === true || doc?.repliesDisabled === true) &&
        (doc?.source === PLATFORM_ANNOUNCEMENT_SOURCE || system.source === PLATFORM_ANNOUNCEMENT_SOURCE) &&
        (system.systemType === PLATFORM_ANNOUNCEMENT_SYSTEM_TYPE || doc?.systemType === PLATFORM_ANNOUNCEMENT_SYSTEM_TYPE)
    );
};

const insertPlatformAnnouncementMessage = async (
    conversationId: string,
    body: string,
    options?: { broadcastId?: string; createdAt?: Date },
) => {
    await ChatMessageDocs.insertOne({
        conversationId,
        senderDid: PLATFORM_ANNOUNCEMENT_SENDER_DID,
        body,
        createdAt: options?.createdAt || new Date(),
        format: "markdown",
        source: PLATFORM_ANNOUNCEMENT_SOURCE,
        ...(options?.broadcastId ? { broadcastId: options.broadcastId } : {}),
        system: {
            messageType: "system",
            systemType: PLATFORM_ANNOUNCEMENT_SYSTEM_TYPE,
            source: PLATFORM_ANNOUNCEMENT_SOURCE,
            repliesDisabled: true,
            templateKey: "platform_broadcast",
            version: "v1",
        },
    });
};

export const listPlatformBroadcastMessages = async (
    options?: { activeOnly?: boolean },
): Promise<PlatformBroadcastMessageDisplay[]> => {
    const query = options?.activeOnly ? { active: true } : {};
    const docs = (await PlatformBroadcastMessages.find(query).sort({ updatedAt: -1, createdAt: -1 }).toArray()) as
        | PlatformBroadcastMessage[]
        | [];
    return docs.map(normalizeBroadcast);
};

const toLegacyBroadcast = (broadcast: PlatformBroadcastMessageDisplay): PlatformBroadcastMessage => ({
    _id: broadcast.id,
    body: broadcast.body,
    active: broadcast.active,
    createdAt: broadcast.createdAt,
    updatedAt: broadcast.updatedAt,
});

export const getPlatformBroadcastMessage = async (): Promise<PlatformBroadcastMessage | null> => {
    const broadcasts = await listPlatformBroadcastMessages();
    const latest = broadcasts[0];
    return latest ? toLegacyBroadcast(latest) : null;
};

export const savePlatformBroadcastMessage = async (input: {
    body: string;
    active: boolean;
}): Promise<PlatformBroadcastMessage> => {
    const body = input.body.trim();
    const active = input.active === true;

    const latest = await getPlatformBroadcastMessage();
    if (latest?._id) {
        const updated = await updatePlatformBroadcastMessage(String(latest._id), {
            body,
            active,
        });
        if (updated) {
            return toLegacyBroadcast(updated);
        }
    }

    const created = await createPlatformBroadcastMessage(body, active);
    return toLegacyBroadcast(created);
};

export const createPlatformBroadcastMessage = async (
    body: string,
    active: boolean,
): Promise<PlatformBroadcastMessageDisplay> => {
    const now = new Date();
    const doc: PlatformBroadcastMessage = {
        body: body.trim(),
        active,
        createdAt: now,
        updatedAt: now,
    };
    const result = await PlatformBroadcastMessages.insertOne(doc);
    return normalizeBroadcast({ ...doc, _id: result.insertedId });
};

export const updatePlatformBroadcastMessage = async (
    id: string,
    updates: { body?: string; active?: boolean },
): Promise<PlatformBroadcastMessageDisplay | null> => {
    const objectId = toObjectId(id);
    if (!objectId) return null;

    const setUpdates: Partial<PlatformBroadcastMessage> = { updatedAt: new Date() };
    if (typeof updates.body === "string") {
        setUpdates.body = updates.body.trim();
    }
    if (typeof updates.active === "boolean") {
        setUpdates.active = updates.active;
    }

    await PlatformBroadcastMessages.updateOne({ _id: objectId }, { $set: setUpdates });
    const updated = (await PlatformBroadcastMessages.findOne({ _id: objectId })) as PlatformBroadcastMessage | null;
    return updated ? normalizeBroadcast(updated) : null;
};

export const deletePlatformBroadcastMessage = async (id: string): Promise<boolean> => {
    const objectId = toObjectId(id);
    if (!objectId) return false;
    const result = await PlatformBroadcastMessages.deleteOne({ _id: objectId });
    return result.deletedCount > 0;
};

export const ensureAnnouncementConversationForUser = async (userDid: string): Promise<ChatConversation | null> => {
    const user = await Circles.findOne(
        { did: userDid, circleType: "user" },
        { projection: { _id: 1, did: 1 } },
    );
    if (!user) {
        return null;
    }

    const existing = (await ChatConversations.findOne({
        type: "announcement",
        handle: PLATFORM_ANNOUNCEMENT_HANDLE,
        participants: userDid,
        archived: { $ne: true },
    })) as ChatConversation | null;

    if (existing) {
        const conversationId = String(existing._id);
        const needsParticipant = !(existing.participants || []).includes(userDid);
        if (
            existing.name !== PLATFORM_ANNOUNCEMENT_TITLE ||
            existing.handle !== PLATFORM_ANNOUNCEMENT_HANDLE ||
            (existing as any).metadata?.repliesDisabled !== true ||
            needsParticipant
        ) {
            await ChatConversations.updateOne(
                { _id: new ObjectId(conversationId) },
                {
                    $set: {
                        name: PLATFORM_ANNOUNCEMENT_TITLE,
                        handle: PLATFORM_ANNOUNCEMENT_HANDLE,
                        repliesDisabled: true,
                    },
                    ...(needsParticipant ? { $addToSet: { participants: userDid } } : {}),
                },
            );
            const refreshed = (await ChatConversations.findOne({
                _id: new ObjectId(conversationId),
            })) as ChatConversation | null;
            if (refreshed) {
                return normalizeConversation(refreshed);
            }
        }
        return normalizeConversation(existing);
    }

    const now = new Date();
    const created: ChatConversation = {
        type: "announcement",
        name: PLATFORM_ANNOUNCEMENT_TITLE,
        handle: PLATFORM_ANNOUNCEMENT_HANDLE,
        participants: [userDid],
        metadata: {
            repliesDisabled: true,
        } as any,
        createdAt: now,
        updatedAt: now,
    };
    const result = await ChatConversations.insertOne(created);
    return normalizeConversation({ ...created, _id: result.insertedId });
};

export const previewPlatformBroadcastForUser = async (
    userDid: string,
    body: string,
): Promise<{ conversationId?: string; inserted: boolean }> => {
    const trimmed = body.trim();
    if (!trimmed) {
        return { inserted: false };
    }

    const conversation = await ensureAnnouncementConversationForUser(userDid);
    if (!conversation?._id) {
        return { inserted: false };
    }

    const conversationId = String(conversation._id);
    await insertPlatformAnnouncementMessage(conversationId, trimmed, {
        broadcastId: `preview:${new ObjectId().toString()}`,
    });
    await ChatConversations.updateOne({ _id: new ObjectId(conversationId) }, { $set: { updatedAt: new Date() } });

    return { conversationId, inserted: true };
};

export const syncPlatformBroadcastsForUser = async (
    userDid: string,
): Promise<{ conversationId?: string; inserted: number; updated: number }> => {
    const conversation = await ensureAnnouncementConversationForUser(userDid);
    if (!conversation?._id) {
        return { inserted: 0, updated: 0 };
    }

    const conversationId = String(conversation._id);
    const broadcasts = await listPlatformBroadcastMessages({ activeOnly: true });
    if (broadcasts.length === 0) {
        return { conversationId, inserted: 0, updated: 0 };
    }

    const broadcastIds = broadcasts.map((broadcast) => broadcast.id);
    const existingDocs = await ChatMessageDocs.find({
        conversationId,
        broadcastId: { $in: broadcastIds },
    }).toArray();

    const messagesByBroadcastId = new Map<string, any[]>();
    const duplicateIds: ObjectId[] = [];
    for (const doc of existingDocs) {
        const key = typeof (doc as any).broadcastId === "string" ? ((doc as any).broadcastId as string) : undefined;
        if (!key) continue;
        const docs = messagesByBroadcastId.get(key) || [];
        const isDuplicate = docs.some((existingDoc) => isPlatformAnnouncementMessage(existingDoc, String(doc?.body || "")));
        if (isDuplicate && (doc as any)?._id && ObjectId.isValid(String((doc as any)._id))) {
            duplicateIds.push(new ObjectId(String((doc as any)._id)));
            continue;
        }
        docs.push(doc);
        messagesByBroadcastId.set(key, docs);
    }
    if (duplicateIds.length > 0) {
        await ChatMessageDocs.deleteMany({ _id: { $in: duplicateIds } });
    }

    let inserted = 0;
    for (const broadcast of broadcasts) {
        const existing = messagesByBroadcastId.get(broadcast.id) || [];
        const alreadyInserted = existing.some((doc) => isPlatformAnnouncementMessage(doc, broadcast.body));
        if (alreadyInserted) continue;

        await insertPlatformAnnouncementMessage(conversationId, broadcast.body, {
            broadcastId: broadcast.id,
            createdAt: broadcast.updatedAt || broadcast.createdAt,
        });
        inserted += 1;
    }

    if (inserted > 0) {
        await ChatConversations.updateOne(
            { _id: new ObjectId(conversationId) },
            { $set: { updatedAt: new Date() } },
        );
    }

    return { conversationId, inserted, updated: 0 };
};
