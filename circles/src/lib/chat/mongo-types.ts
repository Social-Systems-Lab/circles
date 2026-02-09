export type ChatConversationType = "dm" | "group" | "announcement";

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
    handle?: string;
    circleId?: string;
    participants: string[];
    createdAt: Date;
    updatedAt?: Date;
    archived?: boolean;
    lastMessageAt?: Date;
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
};

export type ChatReadState = {
    _id?: any;
    conversationId: string;
    userDid: string;
    lastReadMessageId: string | null;
    updatedAt: Date;
};
