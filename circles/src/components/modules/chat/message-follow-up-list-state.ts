import type { ChatFollowUpListItem } from "@/lib/data/chat-message-followups";

export const mergeFollowUpPages = (
    current: ChatFollowUpListItem[],
    incoming: ChatFollowUpListItem[],
): ChatFollowUpListItem[] => {
    const byId = new Map(current.map((item) => [item.followUp.id, item]));
    for (const item of incoming) byId.set(item.followUp.id, item);
    return Array.from(byId.values());
};

export const updateFollowUpNoteInItems = (
    items: ChatFollowUpListItem[],
    followUpId: string,
    note: string,
): ChatFollowUpListItem[] =>
    items.map((item) =>
        item.followUp.id === followUpId
            ? {
                  ...item,
                  followUp: {
                      ...item.followUp,
                      ...(note.trim() ? { note: note.trim() } : { note: undefined }),
                  },
              }
            : item,
    );

export const moveFollowUpBetweenFilters = (
    source: ChatFollowUpListItem[],
    destination: ChatFollowUpListItem[],
    followUpId: string,
    completed: boolean,
): { source: ChatFollowUpListItem[]; destination: ChatFollowUpListItem[] } => {
    const item = source.find((candidate) => candidate.followUp.id === followUpId);
    if (!item) return { source, destination };
    const moved = {
        ...item,
        followUp: {
            ...item.followUp,
            updatedAt: new Date(),
            ...(completed ? { completedAt: new Date() } : { completedAt: undefined }),
        },
    };
    return {
        source: source.filter((candidate) => candidate.followUp.id !== followUpId),
        destination: [moved, ...destination.filter((candidate) => candidate.followUp.id !== followUpId)],
    };
};

export type FollowUpFilterName = "open" | "completed";
export type FollowUpMutation = { version: number; destination?: FollowUpFilterName };

export const reconcileFollowUpListResponse = ({
    current,
    incoming,
    filter,
    requestMutationVersion,
    mutations,
    loadMore,
}: {
    current: ChatFollowUpListItem[];
    incoming: ChatFollowUpListItem[];
    filter: FollowUpFilterName;
    requestMutationVersion: number;
    mutations: ReadonlyMap<string, FollowUpMutation>;
    loadMore: boolean;
}): ChatFollowUpListItem[] => {
    const currentById = new Map(current.map((item) => [item.followUp.id, item]));
    const safeIncoming = incoming
        .filter((item) => {
            const mutation = mutations.get(item.followUp.id);
            return (
                !mutation ||
                mutation.version <= requestMutationVersion ||
                !mutation.destination ||
                mutation.destination === filter
            );
        })
        .map((item) => {
            const mutation = mutations.get(item.followUp.id);
            return mutation && mutation.version > requestMutationVersion
                ? currentById.get(item.followUp.id) || item
                : item;
        });
    const base = loadMore ? mergeFollowUpPages(current, safeIncoming) : safeIncoming;
    const locallyAdded = current.filter((item) => {
        const mutation = mutations.get(item.followUp.id);
        return mutation && mutation.version > requestMutationVersion && mutation.destination === filter;
    });
    return mergeFollowUpPages(locallyAdded, base);
};
