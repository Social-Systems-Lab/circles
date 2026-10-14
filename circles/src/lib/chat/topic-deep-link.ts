export async function validateTopicDeepLink(
    requestedTopicId: string | string[] | undefined,
    conversationId: string,
    findTopic: (topicId: string, conversationId: string) => Promise<unknown>,
): Promise<string | undefined> {
    if (typeof requestedTopicId !== "string" || !/^[0-9a-fA-F]{24}$/.test(requestedTopicId)) return undefined;
    return (await findTopic(requestedTopicId, conversationId)) ? requestedTopicId : undefined;
}

export function buildCanonicalChatRedirectPath(
    conversationId: string,
    requestedTopicId: string | string[] | undefined,
): string {
    const basePath = `/chat/${conversationId}`;
    if (typeof requestedTopicId !== "string" || !/^[0-9a-fA-F]{24}$/.test(requestedTopicId)) return basePath;
    return `${basePath}?topic=${requestedTopicId}`;
}

export function selectLoadedDeepLinkTopic(
    topicId: string | undefined,
    messages: Array<{ id?: string; thread?: unknown }>,
): string | undefined {
    return topicId && messages.some((message) => message.id === topicId && Boolean(message.thread)) ? topicId : undefined;
}
