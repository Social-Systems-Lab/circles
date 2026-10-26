export const CONVERSATION_MUTE_PREFERENCE_EVENT = "kamooni:conversation-mute-preference";
export const CONVERSATION_MUTE_PENDING_EVENT = "kamooni:conversation-mute-pending";

const pendingMuteMutations = new Set<string>();

export const createLatestPreferenceRequest = () => {
    let latestRequestId = 0;
    return {
        next: () => ++latestRequestId,
        invalidate: () => {
            latestRequestId += 1;
        },
        isCurrent: (requestId: number) => requestId === latestRequestId,
    };
};

export const isConversationMuteMutationPending = (conversationId: string): boolean =>
    pendingMuteMutations.has(conversationId);

export const beginConversationMuteMutation = (conversationId: string): boolean => {
    if (pendingMuteMutations.has(conversationId)) return false;
    pendingMuteMutations.add(conversationId);
    window.dispatchEvent(
        new CustomEvent(CONVERSATION_MUTE_PENDING_EVENT, {
            detail: { conversationId, pending: true },
        }),
    );
    return true;
};

export const finishConversationMuteMutation = (conversationId: string): void => {
    pendingMuteMutations.delete(conversationId);
    window.dispatchEvent(
        new CustomEvent(CONVERSATION_MUTE_PENDING_EVENT, {
            detail: { conversationId, pending: false },
        }),
    );
};

export const dispatchConversationMutePreference = (conversationId: string, muted: boolean): void => {
    window.dispatchEvent(
        new CustomEvent(CONVERSATION_MUTE_PREFERENCE_EVENT, {
            detail: { conversationId, muted },
        }),
    );
};
