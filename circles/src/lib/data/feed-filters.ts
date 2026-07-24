import type { Post } from "@/models/models";

export type FeedPostQueryMode = "noticeboard" | "community" | "discussion";

export const noticeboardPostTypePredicate = {
    $or: [{ postType: { $eq: "post" } }, { postType: { $exists: false } }],
} as const;

export const communityPostTypePredicate = {
    postType: "community",
} as const;

export const discussionPostTypePredicate = {
    postType: "discussion",
} as const;

export const unsupportedPostTypePredicate = {
    _id: { $exists: false },
} as const;

export const getPostTypePredicate = (postType?: Post["postType"] | string | null): Record<string, unknown> => {
    switch (postType) {
        case "community":
            return { ...communityPostTypePredicate };
        case "discussion":
            return { ...discussionPostTypePredicate };
        case "post":
        case undefined:
            return { ...noticeboardPostTypePredicate };
        case "goal":
        case "task":
        case "issue":
        case "proposal":
        case "event":
            return { postType };
        default:
            return { ...unsupportedPostTypePredicate };
    }
};
