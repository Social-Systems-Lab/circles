import { ObjectId } from "mongodb";
import type { CircleModerationStatus } from "@/models/models";
import { ChatConversations, ChatRoomMembers, Circles, Members } from "@/lib/data/db";
import { createThread } from "@/lib/data/mongo-chat";
import { sendNotifications } from "@/lib/data/notifications";

export type ModerationMessagingInput = {
    lifecycleEventId: string;
    circleId: string;
    circleName: string;
    actorDid: string;
    previousStatus: CircleModerationStatus;
    status: CircleModerationStatus;
    reason: string;
    changedAt: Date;
};

export type ModerationMessagingDependencies = {
    findAdminDids: (circleId: string) => Promise<string[]>;
    findConversation: (handle: string) => Promise<any>;
    reserveConversationId: (circleId: string, candidateId: ObjectId) => Promise<ObjectId>;
    findModeratorDids: (conversationId: string, participantDids: string[]) => Promise<string[]>;
    createConversation: (conversation: any) => Promise<any>;
    updateConversation: (conversationId: ObjectId, participants: string[]) => Promise<void>;
    activateMember: (conversationId: string, userDid: string, role: "admin" | "member", joinedAt: Date) => Promise<void>;
    removeFormerMembers: (conversationId: string, currentDids: string[]) => Promise<void>;
    createThread: typeof createThread;
    sendNotifications: typeof sendNotifications;
};

const defaultDependencies: ModerationMessagingDependencies = {
    findAdminDids: async (circleId) =>
        (
            await Members.find({ circleId, userGroups: "admins" }, { projection: { userDid: 1 } }).toArray()
        ).flatMap((member) => (typeof member.userDid === "string" && member.userDid ? [member.userDid] : [])),
    findConversation: (handle) => ChatConversations.findOne({ handle, type: "group" }),
    reserveConversationId: async (circleId, candidateId) => {
        const circle = await Circles.findOneAndUpdate(
            { _id: new ObjectId(circleId), moderationConversationId: { $exists: false } } as any,
            { $set: { moderationConversationId: candidateId } } as any,
            { returnDocument: "after", projection: { moderationConversationId: 1 } },
        );
        const reservedId = (circle as any)?.moderationConversationId;
        if (reservedId) return new ObjectId(String(reservedId));

        const existingCircle = await Circles.findOne(
            { _id: new ObjectId(circleId) },
            { projection: { moderationConversationId: 1 } as any },
        );
        const existingId = (existingCircle as any)?.moderationConversationId;
        if (!existingId) throw new Error("Circle moderation conversation could not be reserved.");
        return new ObjectId(String(existingId));
    },
    findModeratorDids: async (conversationId, participantDids) => {
        if (!participantDids.length) return [];
        const chatRoomIds: Array<string | ObjectId> = [conversationId];
        if (ObjectId.isValid(conversationId)) chatRoomIds.push(new ObjectId(conversationId));
        return (
            await ChatRoomMembers.find(
                { chatRoomId: { $in: chatRoomIds }, userDid: { $in: participantDids }, role: "admin" } as any,
                { projection: { userDid: 1 } },
            ).toArray()
        ).flatMap((member) => (typeof member.userDid === "string" && member.userDid ? [member.userDid] : []));
    },
    createConversation: async (conversation) => {
        const result = await ChatConversations.insertOne(conversation);
        return { ...conversation, _id: result.insertedId };
    },
    updateConversation: async (conversationId, participants) => {
        await ChatConversations.updateOne(
            { _id: conversationId },
            {
                $set: {
                    participants,
                    archived: false,
                    metadata: { source: "circle_moderation", version: "v1" },
                },
                $unset: { circleId: "" },
            },
        );
    },
    activateMember: async (conversationId, userDid, role, joinedAt) => {
        await ChatRoomMembers.updateOne(
            { userDid, chatRoomId: conversationId },
            {
                $setOnInsert: { userDid, chatRoomId: conversationId, joinedAt },
                $set: { role, status: "active", active: true, isActive: true } as any,
            },
            { upsert: true },
        );
    },
    removeFormerMembers: async (conversationId, currentDids) => {
        const chatRoomIds: Array<string | ObjectId> = [conversationId];
        if (ObjectId.isValid(conversationId)) chatRoomIds.push(new ObjectId(conversationId));
        await ChatRoomMembers.deleteMany({ chatRoomId: { $in: chatRoomIds }, userDid: { $nin: currentDids } } as any);
    },
    createThread,
    sendNotifications,
};

export async function sendCircleModerationMessage(
    input: ModerationMessagingInput,
    dependencies: ModerationMessagingDependencies = defaultDependencies,
): Promise<{ conversationId: string; topicId: string }> {
    const handle = `circle-moderation-${input.circleId}`;
    const adminDids = [...new Set(await dependencies.findAdminDids(input.circleId))];
    const now = new Date();

    let conversation = await dependencies.findConversation(handle);
    if (!conversation) {
        const conversationId = await dependencies.reserveConversationId(input.circleId, new ObjectId());
        try {
            conversation = await dependencies.createConversation({
                _id: conversationId,
                type: "group",
                name: `${input.circleName} moderation`,
                description: "Private moderation discussion between platform moderation and current Circle admins.",
                handle,
                participants: [],
                metadata: { source: "circle_moderation", version: "v1" },
                createdAt: now,
                updatedAt: now,
            });
        } catch (error) {
            conversation = await dependencies.findConversation(handle);
            if (!conversation) throw error;
        }
    }

    const conversationId = String(conversation._id);
    const moderatorDids = await dependencies.findModeratorDids(conversationId, conversation.participants || []);
    const moderatorDidSet = new Set(moderatorDids);
    const participants = [...new Set([...moderatorDids, input.actorDid, ...adminDids])];
    // Revoke stale memberships first: active ChatRoomMembers are the authorization boundary.
    await dependencies.removeFormerMembers(conversationId, participants);
    await dependencies.updateConversation(new ObjectId(conversationId), participants);
    for (const participantDid of participants) {
        await dependencies.activateMember(
            conversationId,
            participantDid,
            participantDid === input.actorDid || moderatorDidSet.has(participantDid) ? "admin" : "member",
            now,
        );
    }

    const messageBody = [
        `Circle: ${input.circleName}`,
        `Status: ${input.previousStatus} → ${input.status}`,
        `Reason: ${input.reason}`,
        `Changed at: ${input.changedAt.toISOString()}`,
    ].join("\n");
    const titles: Record<CircleModerationStatus, string> = {
        active: "Circle reactivated",
        paused: "Circle paused",
        suspended: "Circle suspended",
        removed: "Circle removed",
    };
    const topic = await dependencies.createThread(
        conversationId,
        input.actorDid,
        titles[input.status],
        messageBody,
        [],
        { source: "circle_moderation", version: "v1", lifecycleEventId: input.lifecycleEventId } as any,
        input.lifecycleEventId,
    );
    if (!topic?._id) throw new Error("Circle moderation topic could not be created.");
    const topicId = String(topic._id);

    const notificationDids = adminDids.filter((did) => did !== input.actorDid);
    if (notificationDids.length) {
        for (const did of notificationDids) {
            await dependencies.sendNotifications(
                "circle_moderation_update",
                [{ did }],
                {
                roomId: conversationId,
                topicId,
                url: `/chat/${conversationId}?topic=${topicId}`,
                messageBody: "A Circle moderation update is ready for review.",
                },
                { idempotencyKey: `circle-moderation:${input.lifecycleEventId}` },
            );
        }
    }

    return { conversationId, topicId };
}
