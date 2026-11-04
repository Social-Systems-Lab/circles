export const TOPIC_TEXT_DRAFT_DEBOUNCE_MS = 400;

export type TopicDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type TopicDraftTimers = {
    setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};

export const getTopicTextDraftKey = (
    userDid: string | undefined,
    conversationId: string,
    topicId: string,
): string | null => {
    if (!userDid || !conversationId || !topicId) return null;
    return `kamooni:chat-topic-text-draft:v1:${[userDid, conversationId, topicId].map(encodeURIComponent).join(":")}`;
};

const getStorageSafely = (getStorage: () => TopicDraftStorage | null): TopicDraftStorage | null => {
    try {
        return getStorage();
    } catch {
        return null;
    }
};

export const readTopicTextDraft = (getStorage: () => TopicDraftStorage | null, key: string): string => {
    const storage = getStorageSafely(getStorage);
    if (!storage) return "";
    try {
        const raw = storage.getItem(key);
        if (raw === null) return "";
        const parsed: unknown = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== "object" ||
            (parsed as { version?: unknown }).version !== 1 ||
            typeof (parsed as { text?: unknown }).text !== "string"
        ) {
            storage.removeItem(key);
            return "";
        }
        return (parsed as { text: string }).text;
    } catch {
        return "";
    }
};

export const writeTopicTextDraft = (getStorage: () => TopicDraftStorage | null, key: string, text: string): void => {
    const storage = getStorageSafely(getStorage);
    if (!storage) return;
    try {
        if (!text.trim()) {
            storage.removeItem(key);
            return;
        }
        storage.setItem(key, JSON.stringify({ version: 1, text }));
    } catch {
        // Storage can be unavailable or full; drafts remain best-effort client state.
    }
};

export const removeTopicTextDraft = (getStorage: () => TopicDraftStorage | null, key: string): void => {
    const storage = getStorageSafely(getStorage);
    if (!storage) return;
    try {
        storage.removeItem(key);
    } catch {
        // Storage can be unavailable; successful sends must still complete.
    }
};

export const createDebouncedTopicDraftWriter = (
    getStorage: () => TopicDraftStorage | null,
    delay = TOPIC_TEXT_DRAFT_DEBOUNCE_MS,
    timers: TopicDraftTimers = {
        setTimeout: (callback, timeout) => setTimeout(callback, timeout),
        clearTimeout: (timer) => clearTimeout(timer),
    },
) => {
    let pending: { key: string; text: string; timer: ReturnType<typeof setTimeout> } | null = null;

    const flush = () => {
        if (!pending) return;
        const current = pending;
        pending = null;
        timers.clearTimeout(current.timer);
        writeTopicTextDraft(getStorage, current.key, current.text);
    };

    return {
        schedule(key: string, text: string) {
            if (!key) return;
            if (pending?.key !== key) flush();
            if (pending) timers.clearTimeout(pending.timer);
            const next = { key, text, timer: undefined as unknown as ReturnType<typeof setTimeout> };
            next.timer = timers.setTimeout(() => {
                if (pending !== next) return;
                pending = null;
                writeTopicTextDraft(getStorage, next.key, next.text);
            }, delay);
            pending = next;
        },
        flush,
        clear(key: string) {
            if (pending?.key === key) {
                timers.clearTimeout(pending.timer);
                pending = null;
            }
            removeTopicTextDraft(getStorage, key);
        },
        dispose: flush,
    };
};
