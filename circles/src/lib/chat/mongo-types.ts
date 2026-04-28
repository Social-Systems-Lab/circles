import type { SystemMessageMetadata } from "@/lib/chat/system-messages";

export type ChatConversationType = "dm" | "group" | "announcement";

export type ChatConversationMetadata = {
    source?: string;
    version?: string;
    repliesDisabled?: boolean;
    senderHandle?: string;
    senderName?: string;
    senderAvatarUrl?: string;
    contactType?: "offer_help" | "ask_question";
};

export type ChatAttachment = {
    url: string;
    name: string;
    mimeType?: string;
    size?: number;
    key?: string;
    width?: number;
    height?: number;
};

export type ChatReaction = {
    emoji: string;
    userDid: string;
    createdAt: Date;
};

export type ChatConversation = {
    _id?: any;
    type: ChatConversationType;
    name?: string;
    description?: string;
    handle?: string;
    circleId?: string;
    picture?: { url: string };
    participants: string[];
    createdAt: Date;
    updatedAt?: Date;
    archived?: boolean;
    lastMessageAt?: Date;
    metadata?: ChatConversationMetadata;
};

export type ChatMessageDoc = {
    _id?: any;
    conversationId: string;
    senderDid: string;
    body: string;
    createdAt: Date;
    editedAt?: Date;
    replyToMessageId?: string;
    attachments?: ChatAttachment[];
    reactions?: ChatReaction[];
    format?: "markdown";
    source?: string;
    version?: string;
    system?: SystemMessageMetadata;
    thread?: ChatThreadMeta;
    threadId?: string;
};

export type ChatReadState = {
    _id?: any;
    conversationId: string;
    userDid: string;
    lastReadMessageId: string | null;
    updatedAt: Date;
};

export type MessageEmailReminderStatus = "pending" | "processing" | "sent" | "skipped" | "failed";

export type MessageEmailReminder = {
    _id?: any;
    messageId: string;
    conversationId: string;
    senderDid: string;
    recipientDid: string;
    dueAt: Date;
    status: MessageEmailReminderStatus;
    createdAt: Date;
    updatedAt: Date;
    sentAt?: Date;
    skippedAt?: Date;
    failedAt?: Date;
    processingStartedAt?: Date;
    skipReason?: string;
    failureReason?: string;
};

export type ChatThreadMeta = {
    title: string;
    hashtags?: string[];
    createdAt: Date;
    updatedAt: Date;
    replyCount: number;
};
