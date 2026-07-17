import type { ChatMessage } from "@/models/models";

export const FIRST_TOPIC_DEFAULT_TITLE = "Hello";

export const isTopicStarterMessage = (message: Pick<ChatMessage, "type"> & Record<string, any>): boolean =>
    message.type === "m.room.message" && !!message.thread && !message.threadId;

export const getTopicActivityTime = (message: Record<string, any>): number => {
    const rawTimestamp = message.thread?.updatedAt || message.createdAt;
    const timestamp = new Date(rawTimestamp).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const getTopicIndexMessages = (messages: ChatMessage[]): ChatMessage[] =>
    messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => isTopicStarterMessage(message as ChatMessage & Record<string, any>))
        .sort((left, right) => {
            const activityDelta =
                getTopicActivityTime(left.message as any) - getTopicActivityTime(right.message as any);
            return activityDelta || left.index - right.index;
        })
        .map(({ message }) => message);

export const getInitialTopicTitle = (topicCount: number): string => (topicCount <= 0 ? FIRST_TOPIC_DEFAULT_TITLE : "");
