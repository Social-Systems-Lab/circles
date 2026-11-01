export async function validateTopicDeepLink(
    requestedTopicId: string | string[] | undefined,
    conversationId: string,
    findTopic: (topicId: string, conversationId: string) => Promise<unknown>,
): Promise<string | undefined> {
    if (typeof requestedTopicId !== "string" || !/^[0-9a-fA-F]{24}$/.test(requestedTopicId)) return undefined;
    return (await findTopic(requestedTopicId, conversationId)) ? requestedTopicId : undefined;
}

type MessageDeepLinkTarget = { conversationId?: string; threadId?: string; thread?: unknown };

export async function validateMessageDeepLink(
    requestedMessageId: string | string[] | undefined,
    conversationId: string,
    topicId: string | undefined,
    findMessage: (messageId: string, conversationId: string) => Promise<MessageDeepLinkTarget | null>,
): Promise<string | undefined> {
    if (typeof requestedMessageId !== "string" || !/^[0-9a-fA-F]{24}$/.test(requestedMessageId)) return undefined;
    const message = await findMessage(requestedMessageId, conversationId);
    if (!message || message.conversationId !== conversationId) return undefined;
    const messageTopicId = message.threadId || (message.thread ? requestedMessageId : undefined);
    return messageTopicId === topicId ? requestedMessageId : undefined;
}

export function buildCanonicalChatRedirectPath(
    conversationId: string,
    requestedTopicId: string | string[] | undefined,
    requestedMessageId?: string | string[],
): string {
    const basePath = `/chat/${conversationId}`;
    const params = new URLSearchParams();
    if (typeof requestedTopicId === "string" && /^[0-9a-fA-F]{24}$/.test(requestedTopicId)) {
        params.set("topic", requestedTopicId);
    }
    if (typeof requestedMessageId === "string" && /^[0-9a-fA-F]{24}$/.test(requestedMessageId)) {
        params.set("message", requestedMessageId);
    } else if (requestedMessageId !== undefined) {
        // Preserve exact-navigation intent through handle canonicalization without accepting an invalid target.
        params.set("message", "");
    }
    return params.size ? `${basePath}?${params}` : basePath;
}

export function selectLoadedDeepLinkTopic(
    topicId: string | undefined,
    messages: Array<{ id?: string; thread?: unknown }>,
): string | undefined {
    return topicId && messages.some((message) => message.id === topicId && Boolean(message.thread))
        ? topicId
        : undefined;
}
