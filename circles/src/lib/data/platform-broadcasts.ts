import { ObjectId } from "mongodb";
import { buildSystemMessageMetadata } from "@/lib/chat/system-messages";
import type { ChatConversation, ChatConversationMetadata } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, PlatformBroadcastMessages } from "./db";

export type PlatformBroadcastMessage = {
    _id?: any;
    body: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export const PLATFORM_BROADCAST_SOURCE = "platform_admin" as const;
export const PLATFORM_BROADCAST_SYSTEM_TYPE = "announcement" as const;
export const PLATFORM_BROADCAST_VERSION = "v1" as const;
export const PLATFORM_BROADCAST_SENDER_DID = "system:platform_admin";

const PLATFORM_BROADCAST_HANDLE = "platform-announcements";
const PLATFORM_BROADCAST_THREAD_NAME = "Platform Announcements";
const PLATFORM_BROADCAST_TEMPLATE_KEY = "platform_broadcast";

const toObjectId = (value?: string | null): ObjectId | null => {
    if (!value || !ObjectId.isValid(value)) return null;
    return new ObjectId(value);
};

const normalizeBroadcast = (doc: PlatformBroadcastMessage): PlatformBroadcastMessage => ({
    _id: doc._id,
    body: typeof doc.body === "string" ? doc.body : "",
    active: doc.active === true,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
});

const buildConversationMetadata = (): ChatConversationMetadata => ({
    source: PLATFORM_BROADCAST_SOURCE,
    version: PLATFORM_BROADCAST_VERSION,
    repliesDisabled: true,
    senderHandle: "kamooni",
    senderName: "@kamooni",
    senderAvatarUrl: "/icon.svg",
});

export const getPlatformBroadcastMessage = async (): Promise<PlatformBroadcastMessage | null> => {
    const doc = (await PlatformBroadcastMessages.findOne(
        {},
        { sort: { updatedAt: -1, createdAt: -1 } },
    )) as PlatformBroadcastMessage | null;
    return doc ? normalizeBroadcast(doc) : null;
};

export const savePlatformBroadcastMessage = async (input: {
    body: string;
    active: boolean;
}): Promise<PlatformBroadcastMessage> => {
    const body = input.body.trim();
    const active = input.active === true;
    const now = new Date();

    const latest = await getPlatformBroadcastMessage();
    if (latest?._id) {
        const latestId = toObjectId(String(latest._id));
        if (latestId) {
            await PlatformBroadcastMessages.updateOne(
                { _id: latestId },
                {
                    $set: {
                        body,
                        active,
                        updatedAt: now,
                    },
                },
            );

            await PlatformBroadcastMessages.deleteMany({ _id: { $ne: latestId } });
            const updated = (await PlatformBroadcastMessages.findOne({ _id: latestId })) as PlatformBroadcastMessage | null;
            if (updated) return normalizeBroadcast(updated);
        }
    }

    const doc: PlatformBroadcastMessage = {
        body,
        active,
        createdAt: now,
        updatedAt: now,
    };
    const result = await PlatformBroadcastMessages.insertOne(doc);
    await PlatformBroadcastMessages.deleteMany({ _id: { $ne: result.insertedId } });
    return normalizeBroadcast({ ...doc, _id: result.insertedId });
};

const getActivePlatformBroadcastMessage = async (): Promise<PlatformBroadcastMessage | null> => {
    const message = await getPlatformBroadcastMessage();
    if (!message || message.active !== true) return null;
    if (!message.body.trim()) return null;
    return message;
};

const ensurePlatformBroadcastConversationForUser = async (userDid: string): Promise<ChatConversation | null> => {
    const existing = (await ChatConversations.findOne({
        type: "dm",
        handle: PLATFORM_BROADCAST_HANDLE,
        participants: userDid,
        archived: { $ne: true },
    })) as ChatConversation | null;

    const metadata = buildConversationMetadata();

    if (existing) {
        const conversationId = toObjectId(String(existing._id));
        const shouldAddParticipant = !(existing.participants || []).includes(userDid);
        if (conversationId) {
            await ChatConversations.updateOne(
                { _id: conversationId },
                {
                    $set: {
                        name: PLATFORM_BROADCAST_THREAD_NAME,
                        handle: PLATFORM_BROADCAST_HANDLE,
                        picture: { url: "/icon.svg" },
                        metadata,
                    },
                    ...(shouldAddParticipant ? { $addToSet: { participants: userDid } } : {}),
                },
            );
        }
        return existing;
    }

    const now = new Date();
    const doc: ChatConversation = {
        type: "dm",
        name: PLATFORM_BROADCAST_THREAD_NAME,
        handle: PLATFORM_BROADCAST_HANDLE,
        participants: [userDid],
        picture: { url: "/icon.svg" },
        metadata,
        createdAt: now,
        updatedAt: now,
    };
    const created = await ChatConversations.insertOne(doc);
    return {
        ...doc,
        _id: created.insertedId,
    };
};

export const syncPlatformBroadcastForUser = async (
    userDid: string,
): Promise<{ conversationId?: string; inserted: number; updated: number }> => {
    const activeBroadcast = await getActivePlatformBroadcastMessage();
    if (!activeBroadcast?._id) {
        return { inserted: 0, updated: 0 };
    }

    const conversation = await ensurePlatformBroadcastConversationForUser(userDid);
    if (!conversation?._id) {
        return { inserted: 0, updated: 0 };
    }

    const conversationId = String(conversation._id);
    const broadcastId = String(activeBroadcast._id);
    const existingMessages = await ChatMessageDocs.find({
        conversationId,
        broadcastId,
    })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();

    if (existingMessages.length > 1) {
        const duplicateIds = existingMessages
            .slice(1)
            .map((doc) => toObjectId(String((doc as any)._id)))
            .filter(Boolean) as ObjectId[];
        if (duplicateIds.length > 0) {
            await ChatMessageDocs.deleteMany({ _id: { $in: duplicateIds } });
        }
    }

    const now = new Date();
    const systemMetadata = buildSystemMessageMetadata({
        systemType: PLATFORM_BROADCAST_SYSTEM_TYPE,
        source: PLATFORM_BROADCAST_SOURCE,
        targetDid: userDid,
        repliesDisabled: true,
        templateKey: PLATFORM_BROADCAST_TEMPLATE_KEY,
        version: PLATFORM_BROADCAST_VERSION,
    });
    const primary = existingMessages[0];

    if (!primary) {
        await ChatMessageDocs.insertOne({
            conversationId,
            senderDid: PLATFORM_BROADCAST_SENDER_DID,
            body: activeBroadcast.body,
            createdAt: activeBroadcast.createdAt || now,
            format: "markdown",
            source: PLATFORM_BROADCAST_SOURCE,
            version: PLATFORM_BROADCAST_VERSION,
            system: systemMetadata,
            broadcastId,
        } as any);
        const conversationObjectId = toObjectId(conversationId);
        if (conversationObjectId) {
            await ChatConversations.updateOne(
                { _id: conversationObjectId },
                { $set: { updatedAt: now } },
            );
        }
        return { conversationId, inserted: 1, updated: 0 };
    }

    const primaryId = toObjectId(String((primary as any)?._id));
    const needsUpdate =
        (primary as any)?.body !== activeBroadcast.body ||
        (primary as any)?.source !== PLATFORM_BROADCAST_SOURCE ||
        (primary as any)?.version !== PLATFORM_BROADCAST_VERSION ||
        ((primary as any)?.system?.systemType as string | undefined) !== PLATFORM_BROADCAST_SYSTEM_TYPE ||
        ((primary as any)?.system?.source as string | undefined) !== PLATFORM_BROADCAST_SOURCE ||
        ((primary as any)?.system?.repliesDisabled as boolean | undefined) !== true;

    if (primaryId && needsUpdate) {
        await ChatMessageDocs.updateOne(
            { _id: primaryId },
            {
                $set: {
                    body: activeBroadcast.body,
                    format: "markdown",
                    source: PLATFORM_BROADCAST_SOURCE,
                    version: PLATFORM_BROADCAST_VERSION,
                    system: systemMetadata,
                    editedAt: now,
                },
            },
        );
        const conversationObjectId = toObjectId(conversationId);
        if (conversationObjectId) {
            await ChatConversations.updateOne(
                { _id: conversationObjectId },
                { $set: { updatedAt: now } },
            );
        }
        return { conversationId, inserted: 0, updated: 1 };
    }

    return { conversationId, inserted: 0, updated: 0 };
};
