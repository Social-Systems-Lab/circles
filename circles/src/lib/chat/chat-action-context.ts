import { AsyncLocalStorage } from "node:async_hooks";

export type ChatActionContext = {
    viewerDid?: string | null;
    findConversation?: (conversationId: string) => Promise<any | null>;
    findCircle?: (circleId: string) => Promise<any | null>;
    findCanonicalMember?: (viewerDid: string, circleId: string) => Promise<any | null>;
    findChatMember?: (viewerDid: string, conversationId: string) => Promise<any | null>;
    findLegacyChatMember?: (viewerDid: string, chatRoomId: string) => Promise<any | null>;
    findLegacyChatRoom?: (chatRoomId: string) => Promise<any | null>;
    findMessage?: (messageId: string) => Promise<any | null>;
    findCanonicalMemberships?: (viewerDid: string) => Promise<any[]>;
    findCandidates?: (viewerDid: string, canonicalCircleIds: string[]) => Promise<any[]>;
    findOwningCircles?: (circleIds: string[]) => Promise<any[]>;
    findChatMemberships?: (conversationIds: string[]) => Promise<any[]>;
    mapConversations?: (viewerDid: string, conversations: any[], circles: any[]) => Promise<any[]>;
    getUnreadCounts?: (viewerDid: string, conversationIds: string[]) => Promise<Record<string, number>>;
    findMessagingUser?: (viewerDid: string) => Promise<any | null>;
    fetchRecentMessages?: (conversationId: string, limit: number) => Promise<any[]>;
    createMessage?: (input: any) => Promise<any>;
    notifyMessage?: (input: any) => Promise<void>;
    listChatMembers?: (conversationId: string) => Promise<any[]>;
    updateChatMemberRole?: (
        filter: { _id: unknown },
        update: { $set: { role: "admin"; status: "active"; active: true; isActive: true } },
    ) => Promise<{ matchedCount: number; modifiedCount?: number }>;
    findUserByDid?: (userDid: string) => Promise<any | null>;
    ensureCircleConversation?: (circleId: string) => Promise<any>;
    authorizeFeature?: (viewerDid: string, circleId: string) => Promise<boolean>;
    joinLegacyChatRoomEffect?: (viewerDid: string, chatRoomId: string) => Promise<any>;
    leaveLegacyChatRoomEffect?: (viewerDid: string, chatRoomId: string) => Promise<any>;
    contactCircleAdminsEffect?: (input: any) => Promise<any>;
    sendSystemMessageEffect?: (input: any) => Promise<{ created: boolean; messageId: string }>;
    saveFile?: (...args: any[]) => Promise<any>;
    observeEffect?: (effect: ChatActionEffect) => void;
};

export type ChatActionEffect =
    | "message-persistence"
    | "notification"
    | "system-message"
    | "membership-mutation"
    | "conversation-mutation"
    | "conversation-read-state"
    | "topic-read-state"
    | "role-repair"
    | "storage-write"
    | "avatar-storage-write"
    | "conversation-ensure-create"
    | "topic-create"
    | "topic-update"
    | "topic-delete"
    | "reply-create"
    | "message-edit"
    | "message-delete"
    | "reaction-mutation"
    | "group-delete"
    | "group-leave"
    | "member-add"
    | "member-remove"
    | "member-promote";

const chatActionContext = new AsyncLocalStorage<ChatActionContext>();

export const runWithChatActionContext = async <T>(context: ChatActionContext, callback: () => Promise<T>): Promise<T> =>
    chatActionContext.run(context, callback);

export const getChatActionContext = (): ChatActionContext | undefined => chatActionContext.getStore();

export const observeChatActionEffect = (effect: ChatActionEffect): void => {
    getChatActionContext()?.observeEffect?.(effect);
};

export const getChatActionViewerDid = async (
    productionViewer: () => Promise<string | undefined>,
): Promise<string | undefined> => {
    const context = getChatActionContext();
    return context && "viewerDid" in context ? context.viewerDid || undefined : productionViewer();
};
