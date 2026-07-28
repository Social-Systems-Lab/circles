import type { Post } from "@/models/models";
import { getPostCreateFeature } from "./constants";

type RuntimePostType = Post["postType"] | string | null | undefined;

type ValidatePostUpdateContentInput = {
    postType?: RuntimePostType;
    title?: string | null;
    existingTitle?: string | null;
    content?: string | null;
    mediaCount?: number;
};

type PostContentPolicyResult = { ok: true } | { ok: false; message: string };

export const showsPostTitle = (postType?: RuntimePostType): boolean => postType !== "community";

export const requiresPostTitle = (postType?: RuntimePostType): boolean => postType !== "community";

export const getPostTitleUpdate = (postType: RuntimePostType, title?: string | null): Pick<Partial<Post>, "title"> => {
    if (postType === "community") {
        return {};
    }
    return { title: title?.trim() || undefined };
};

export const validatePostUpdateContent = ({
    postType,
    title,
    existingTitle,
    content,
    mediaCount = 0,
}: ValidatePostUpdateContentInput): PostContentPolicyResult => {
    if (!getPostCreateFeature(postType)) {
        return { ok: false, message: "Unsupported post type" };
    }

    if (postType === "community") {
        if (!content?.trim() && mediaCount <= 0) {
            return { ok: false, message: "Community posts must include text or an image" };
        }
        return { ok: true };
    }

    if (postType === "discussion" && !title?.trim()) {
        return { ok: false, message: "Title is required" };
    }

    // Preserve the existing update behaviour for titled post types: an existing
    // title also satisfies validation when a client omits the field.
    if (!existingTitle?.trim() && !title?.trim()) {
        return { ok: false, message: "Title is required" };
    }

    return { ok: true };
};
