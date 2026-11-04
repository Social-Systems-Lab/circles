const normalizeLabel = (value?: string | null): string | undefined => {
    const label = value?.trim();
    return label || undefined;
};

export const buildChatMentionNotificationMessage = (senderName?: string | null, topicTitle?: string | null): string => {
    const sender = normalizeLabel(senderName) || "Someone";
    const topic = normalizeLabel(topicTitle);
    return topic ? `${sender} mentioned you in “${topic}”` : `${sender} mentioned you in chat`;
};

export const presentChatMentionNotificationMessage = ({
    message,
    senderName,
    topicTitle,
}: {
    message?: string | null;
    senderName?: string | null;
    topicTitle?: string | null;
}): string => {
    const storedMessage = normalizeLabel(message);
    if (!storedMessage || /\bmentioned you in dm-/i.test(storedMessage)) {
        return buildChatMentionNotificationMessage(senderName, topicTitle);
    }
    return storedMessage;
};
