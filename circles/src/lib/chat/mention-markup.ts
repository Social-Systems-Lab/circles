const CHAT_MENTION_MARKUP_REGEX = /\[[^\]]+\]\(\/circles\/([^)]+)\)/g;

export const extractChatMentionIds = (messageBody: string): string[] => {
    const ids = new Set<string>();
    let match: RegExpExecArray | null;
    CHAT_MENTION_MARKUP_REGEX.lastIndex = 0;

    while ((match = CHAT_MENTION_MARKUP_REGEX.exec(messageBody)) !== null) {
        const rawId = match[1]?.trim();
        if (!rawId) continue;

        try {
            ids.add(decodeURIComponent(rawId));
        } catch {
            ids.add(rawId);
        }
    }

    return Array.from(ids);
};
