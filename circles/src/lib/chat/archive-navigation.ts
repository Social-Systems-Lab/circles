export const getPostArchiveNavigationTarget = (
    pathname: string,
    conversationId: string,
): "/chat/archived" | null => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.length === 2 && segments[0] === "chat" && segments[1] === conversationId
        ? "/chat/archived"
        : null;
};
