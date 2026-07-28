type PostIdentity = {
    _id?: unknown;
};

const objectIdPattern = /^[0-9a-f]{24}$/i;

export const normalizePostId = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return objectIdPattern.test(trimmed) ? trimmed.toLowerCase() : null;
};

export const getPostDisplayId = (post: PostIdentity): string | null => normalizePostId(post._id);

export const getDiscussionFormCircleId = ({
    isEditing,
    postCircleId,
    selectedCircleId,
    initialSelectedCircleId,
}: {
    isEditing: boolean;
    postCircleId?: string | null;
    selectedCircleId?: string | null;
    initialSelectedCircleId?: string | null;
}): string | null => {
    if (isEditing) {
        return postCircleId || initialSelectedCircleId || null;
    }
    return selectedCircleId || initialSelectedCircleId || null;
};
