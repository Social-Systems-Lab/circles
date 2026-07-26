import type { Feed } from "@/models/models";
import { getPostCreateFeature } from "./constants";

type RequestedFeed = Pick<Feed, "circleId" | "handle">;

type CreatePostTargetPolicyInput = {
    postType?: string | null;
    circleId: string;
    enabledModules?: string[];
    requestedFeed?: RequestedFeed | null;
    content?: string | null;
    mediaCount?: number;
};

type CreatePostTargetPolicyResult =
    | { ok: true; isCommunityPost: boolean }
    | { ok: false; message: string };

export const validateCreatePostTargetPolicy = ({
    postType,
    circleId,
    enabledModules,
    requestedFeed,
    content,
    mediaCount = 0,
}: CreatePostTargetPolicyInput): CreatePostTargetPolicyResult => {
    if (!getPostCreateFeature(postType)) {
        return { ok: false, message: "Unsupported post type" };
    }

    const isCommunityPost = postType === "community";
    if (isCommunityPost) {
        if (!content?.trim() && mediaCount <= 0) {
            return { ok: false, message: "Community posts must include text or an image" };
        }
        if (!enabledModules?.includes("community")) {
            return { ok: false, message: "Community is not enabled for this circle" };
        }
        if (!requestedFeed) {
            return { ok: false, message: "Community feed is missing" };
        }
        if (requestedFeed.circleId !== circleId || requestedFeed.handle !== "community") {
            return { ok: false, message: "Invalid Community feed" };
        }
        return { ok: true, isCommunityPost };
    }

    if (requestedFeed?.handle === "community") {
        return { ok: false, message: "Normal posts cannot be created in the Community feed" };
    }

    return { ok: true, isCommunityPost };
};
