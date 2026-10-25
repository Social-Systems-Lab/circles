import type { ChatMessage } from "@/models/models";
import { normalizeObjectIdHex } from "@/lib/chat/topic-read-state";
import { selectLatestMessagePosition } from "@/lib/chat/message-position";

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

export const mergeAuthoritativeTopicReplies = (
    currentReplies: ChatMessage[],
    authoritativeReplies: ChatMessage[],
): ChatMessage[] => {
    const authoritativeIds = new Set(authoritativeReplies.map((reply) => reply.id));
    const authoritativeSubmissionIds = new Set(
        authoritativeReplies.map((reply) => reply.submissionId).filter((value): value is string => !!value),
    );
    const localOnly = currentReplies.filter(
        (reply) =>
            (reply.status === "pending" || reply.status === "sent" || reply.status === "failed") &&
            !authoritativeIds.has(reply.id) &&
            (!reply.submissionId || !authoritativeSubmissionIds.has(reply.submissionId)),
    );
    return [...authoritativeReplies, ...localOnly].sort((left, right) => {
        const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return timeDelta || left.id.localeCompare(right.id);
    });
};

export const confirmOptimisticTopicReply = (
    replies: ChatMessage[],
    tempId: string,
    submissionId: string,
    messageId: string,
    createdAt?: Date | string,
): ChatMessage[] => {
    const authoritativeExists = replies.some(
        (reply) =>
            reply.id === messageId ||
            (!!reply.submissionId && reply.submissionId === submissionId && reply.id !== tempId),
    );
    if (authoritativeExists) return replies.filter((reply) => reply.id !== tempId);
    return replies.map((reply) =>
        reply.id === tempId
            ? {
                  ...reply,
                  id: messageId,
                  createdAt: createdAt ? new Date(createdAt) : reply.createdAt,
                  status: "sent",
                  errorMessage: undefined,
              }
            : reply,
    );
};

export const isTopicViewportNearBottom = (
    viewport: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight"> | null,
    threshold = 150,
): boolean =>
    !!viewport && Math.max(0, viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight) <= threshold;

export const shouldAutoScrollTopicReplies = ({
    openedNormally,
    sentReply,
    incomingWasNearBottom,
    incomingCapturedScrollTop,
    currentScrollTop,
}: {
    openedNormally: boolean;
    sentReply: boolean;
    incomingWasNearBottom: boolean;
    incomingCapturedScrollTop: number;
    currentScrollTop: number;
}): boolean =>
    openedNormally || sentReply || (incomingWasNearBottom && currentScrollTop >= incomingCapturedScrollTop - 8);

export const selectTopicReplyScrollTarget = <T>({
    openedNormally,
    sentReply,
    topicEnd,
    composer,
    repliesEnd,
}: {
    openedNormally: boolean;
    sentReply: boolean;
    topicEnd: T | null;
    composer: T | null;
    repliesEnd: T | null;
}): T | null => {
    if (openedNormally) return topicEnd || composer || repliesEnd;
    if (sentReply) return composer || repliesEnd;
    return repliesEnd;
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

export const shouldReconcileTopicReplies = ({
    isTopicOpen,
    expectedReplyCount,
    loadedReplyCount,
}: {
    isTopicOpen: boolean;
    expectedReplyCount: number;
    loadedReplyCount: number;
}): boolean =>
    isTopicOpen &&
    Number.isSafeInteger(expectedReplyCount) &&
    expectedReplyCount >= 0 &&
    expectedReplyCount > loadedReplyCount;

export const shouldScheduleTopicReplyRetry = ({
    signal,
    lastRetriedSignal,
    isTopicOpen,
    loadScope,
    currentLoadScope,
}: {
    signal?: string;
    lastRetriedSignal: string | null;
    isTopicOpen: boolean;
    loadScope: number;
    currentLoadScope: number;
}): boolean => !!signal && isTopicOpen && loadScope === currentLoadScope && signal !== lastRetriedSignal;

export const selectOldestUnreadTopicId = (
    messages: ChatMessage[],
    unreadCounts: Record<string, number>,
): string | undefined => getTopicIndexMessages(messages).find((message) => (unreadCounts[message.id] || 0) > 0)?.id;

export const selectUnreadTopicIds = (messages: ChatMessage[], unreadCounts: Record<string, number>): string[] =>
    getTopicIndexMessages(messages)
        .map((message) => message.id)
        .filter((topicId) => (unreadCounts[topicId] || 0) > 0);

export type TopicAcknowledgementInteraction =
    | "focus"
    | "typing"
    | "emoji"
    | "send"
    | "attachment"
    | "mark-read"
    | "scroll"
    | "expand"
    | "close"
    | "navigate"
    | "draft-state";

export const shouldAcknowledgeTopicInteraction = (
    interaction: TopicAcknowledgementInteraction,
    isProgrammaticFocus = false,
): boolean =>
    interaction === "typing" ||
    interaction === "emoji" ||
    interaction === "send" ||
    interaction === "attachment" ||
    interaction === "mark-read" ||
    (interaction === "focus" && !isProgrammaticFocus);

export const selectTopicAcknowledgementBoundary = ({
    topicId,
    topicCreatedAt,
    replies,
    expectedReplyCount,
}: {
    topicId: string;
    topicCreatedAt?: Date | string | null;
    replies: Array<{ id: string; createdAt?: Date | string | null }>;
    expectedReplyCount: number;
}): string | null => {
    if (!Number.isSafeInteger(expectedReplyCount) || expectedReplyCount < 0) return null;
    if (replies.length !== expectedReplyCount) return null;
    if (!normalizeObjectIdHex(topicId) || replies.some((reply) => !normalizeObjectIdHex(reply.id))) return null;
    return (
        selectLatestMessagePosition([
            { id: topicId, createdAt: topicCreatedAt },
            ...replies.map((reply) => ({ id: reply.id, createdAt: reply.createdAt })),
        ])?.id || null
    );
};

export const selectQueuedTopicAcknowledgementBoundary = ({
    capturedBoundary,
    inFlightBoundary,
    queuedBoundary,
    persistedBoundary,
}: {
    capturedBoundary: string;
    inFlightBoundary: string | null;
    queuedBoundary: string | null;
    persistedBoundary: string | null;
}): { shouldStart: boolean; queuedBoundary: string | null } => {
    const captured = normalizeObjectIdHex(capturedBoundary);
    if (!captured || persistedBoundary === captured || queuedBoundary === captured) {
        return { shouldStart: false, queuedBoundary };
    }
    if (!inFlightBoundary) return { shouldStart: true, queuedBoundary };
    if (captured === inFlightBoundary) {
        return { shouldStart: false, queuedBoundary };
    }
    return { shouldStart: false, queuedBoundary: captured };
};

export const canApplyTopicAcknowledgementResult = ({
    requestId,
    currentRequestId,
    expectedConversationId,
    currentConversationId,
    expectedTopicId,
    currentTopicId,
    expectedLoadScope,
    currentLoadScope,
}: {
    requestId: number;
    currentRequestId: number;
    expectedConversationId: string;
    currentConversationId: string;
    expectedTopicId: string;
    currentTopicId: string;
    expectedLoadScope: number;
    currentLoadScope: number;
}): boolean =>
    requestId === currentRequestId &&
    expectedConversationId === currentConversationId &&
    expectedTopicId === currentTopicId &&
    expectedLoadScope === currentLoadScope;

export const consumePendingTopicScrollRequest = (pending: { current: boolean }): boolean => {
    const shouldScroll = pending.current;
    pending.current = false;
    return shouldScroll;
};

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

export type TopicUnreadBoundary = {
    isComplete: boolean;
    firstUnreadMessageId?: string;
};

export const resolveTopicUnreadBoundary = ({
    starter,
    replies,
    unreadCount,
    currentUserDid,
    expectedReplyCount,
}: {
    starter: { id: string; createdBy?: string };
    replies: Array<{ id: string; createdBy?: string }>;
    unreadCount: number;
    currentUserDid?: string;
    expectedReplyCount: number;
}): TopicUnreadBoundary => {
    if (!Number.isSafeInteger(expectedReplyCount) || expectedReplyCount < 0 || replies.length !== expectedReplyCount) {
        return { isComplete: false };
    }
    if (!Number.isFinite(unreadCount) || unreadCount <= 0) return { isComplete: true };

    let remainingUnread = Math.floor(unreadCount);
    const messages = [starter, ...replies];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (!currentUserDid || messages[index].createdBy !== currentUserDid) {
            remainingUnread -= 1;
            if (remainingUnread === 0) {
                return { isComplete: true, firstUnreadMessageId: messages[index].id };
            }
        }
    }

    return { isComplete: false };
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
