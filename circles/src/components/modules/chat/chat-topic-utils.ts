import type { ChatMessage } from "@/models/models";

export const FIRST_TOPIC_DEFAULT_TITLE = "Hello";

export const isTopicStarterMessage = (message: Pick<ChatMessage, "type"> & Record<string, any>): boolean =>
    message.type === "m.room.message" && !!message.thread && !message.threadId;

export const getTopicCreationTime = (message: Record<string, any>): number => {
    const rawTimestamp = message.thread?.createdAt || message.createdAt;
    const timestamp = new Date(rawTimestamp).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const getTopicIndexMessages = (messages: ChatMessage[]): ChatMessage[] =>
    messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => isTopicStarterMessage(message as ChatMessage & Record<string, any>))
        .sort((left, right) => {
            const creationDelta =
                getTopicCreationTime(left.message as any) - getTopicCreationTime(right.message as any);
            return creationDelta || left.index - right.index;
        })
        .map(({ message }) => message);

export const getTopicViewportSnapshot = (
    messages: ChatMessage[],
): { count: number; latestCreatedAt: number | null } => {
    const topics = getTopicIndexMessages(messages);
    const latestTopic = topics[topics.length - 1];
    return {
        count: topics.length,
        latestCreatedAt: latestTopic ? getTopicCreationTime(latestTopic as any) : null,
    };
};

export const mergeRefreshedTopicStarters = (
    existingMessages: ChatMessage[],
    refreshedStarters: ChatMessage[],
): ChatMessage[] =>
    [
        ...existingMessages.filter((message) => !(message as ChatMessage & Record<string, any>).thread),
        ...refreshedStarters,
    ].sort((left, right) => getTopicCreationTime(left as any) - getTopicCreationTime(right as any));

export const getTopicReplyChangeSignals = (messages: ChatMessage[]): Record<string, string> => {
    const signals: Record<string, string> = {};
    for (const message of messages) {
        const threadId = (message as ChatMessage & { threadId?: string }).threadId;
        if (threadId) signals[threadId] = message.id;
    }
    return signals;
};

export const canApplyTopicReplyLoad = ({
    requestId,
    currentRequestId,
    loadScope,
    currentLoadScope,
    isTopicOpen,
}: {
    requestId: number;
    currentRequestId: number;
    loadScope: number;
    currentLoadScope: number;
    isTopicOpen: boolean;
}): boolean => requestId === currentRequestId && loadScope === currentLoadScope && isTopicOpen;

export const planTopicReplyLoad = ({
    isTopicOpen,
    isInFlight,
    pendingSignal,
    requestedSignal,
}: {
    isTopicOpen: boolean;
    isInFlight: boolean;
    pendingSignal: string | null;
    requestedSignal?: string;
}): { shouldStart: boolean; activeSignal?: string; pendingSignal: string | null } => {
    const nextPendingSignal = requestedSignal || pendingSignal;
    if (!isTopicOpen || isInFlight) {
        return { shouldStart: false, pendingSignal: nextPendingSignal };
    }
    return { shouldStart: true, activeSignal: nextPendingSignal || undefined, pendingSignal: null };
};

export const selectFollowUpTopicReplySignal = ({
    pendingSignal,
    appliedSignal,
    isTopicOpen,
}: {
    pendingSignal: string | null;
    appliedSignal: string | null;
    isTopicOpen: boolean;
}): string | undefined => (isTopicOpen && pendingSignal && pendingSignal !== appliedSignal ? pendingSignal : undefined);

export const selectOldestUnreadTopicId = (
    messages: ChatMessage[],
    unreadCounts: Record<string, number>,
): string | undefined => getTopicIndexMessages(messages).find((message) => (unreadCounts[message.id] || 0) > 0)?.id;

export const selectInitialTopicId = ({
    explicitTopicId,
    initialEntryHandled,
    messages,
    unreadCounts,
}: {
    explicitTopicId?: string;
    initialEntryHandled: boolean;
    messages: ChatMessage[];
    unreadCounts: Record<string, number>;
}): string | undefined => {
    if (explicitTopicId) return explicitTopicId;
    if (initialEntryHandled) return undefined;
    return selectOldestUnreadTopicId(messages, unreadCounts);
};

export type TopicUnreadIndicator = {
    unreadCount: number;
    firstUnreadReplyId?: string;
};

export const createTopicUnreadIndicator = (unreadCount: number): TopicUnreadIndicator | undefined =>
    unreadCount > 0 ? { unreadCount } : undefined;

export const findFirstUnreadReplyId = (
    replies: Array<{ id: string; createdBy?: string }>,
    unreadCount: number,
    currentUserDid?: string,
): string | undefined => {
    let remainingUnread = unreadCount;
    for (let index = replies.length - 1; index >= 0; index -= 1) {
        if (!currentUserDid || replies[index].createdBy !== currentUserDid) {
            remainingUnread -= 1;
            if (remainingUnread <= 0) return replies[index].id;
        }
    }
    return replies[0]?.id;
};

export const shouldAcknowledgeTopicIndicatorFromDraft = (draft: string): boolean => draft.trim().length > 0;

export const acknowledgeTopicUnreadIndicator = (
    indicators: Record<string, TopicUnreadIndicator>,
    topicId: string,
): Record<string, TopicUnreadIndicator> => {
    if (!indicators[topicId]) return indicators;
    const next = { ...indicators };
    delete next[topicId];
    return next;
};

export const recordTopicUnreadIndicatorBoundary = (
    indicators: Record<string, TopicUnreadIndicator>,
    topicId: string,
    firstUnreadReplyId: string,
): Record<string, TopicUnreadIndicator> => {
    const indicator = indicators[topicId];
    if (!indicator || indicator.firstUnreadReplyId === firstUnreadReplyId) return indicators;
    return { ...indicators, [topicId]: { ...indicator, firstUnreadReplyId } };
};

export const getInitialTopicTitle = (topicCount: number): string => (topicCount <= 0 ? FIRST_TOPIC_DEFAULT_TITLE : "");
