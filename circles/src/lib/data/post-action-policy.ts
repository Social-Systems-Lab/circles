import type { Feature, Post } from "@/models/models";
import { getPostCreateFeature, getPostModerateFeature } from "./constants";

type RuntimePostType = Post["postType"] | string | null | undefined;

type PostActionAccessInput = {
    postType?: RuntimePostType;
    isAuthor: boolean;
    isCreateAuthorized: boolean;
    isModerateAuthorized: boolean;
};

export type PostActionAccessResult =
    | { ok: true; reason: "author" | "moderator" }
    | { ok: false; message: string };

export const getPostEditFeature = (postType?: RuntimePostType): Feature | null => {
    return getPostCreateFeature(postType);
};

export const resolvePostRevalidationRoute = (circlePath: string, postType?: RuntimePostType): string | null => {
    switch (postType) {
        case "community":
            return `${circlePath}community`;
        case "discussion":
            return `${circlePath}discussions`;
        case undefined:
        case "post":
        case "goal":
        case "task":
        case "issue":
        case "proposal":
        case "event":
            return `${circlePath}feed`;
        default:
            return null;
    }
};

export const canEditOwnPost = ({
    postType,
    isAuthor,
    isCreateAuthorized,
}: Pick<PostActionAccessInput, "postType" | "isAuthor" | "isCreateAuthorized">): PostActionAccessResult => {
    if (!getPostEditFeature(postType)) {
        return { ok: false, message: "Post not found" };
    }

    if (!isAuthor || !isCreateAuthorized) {
        return { ok: false, message: "You are not authorized to edit this post" };
    }

    return { ok: true, reason: "author" };
};

export const canDeletePost = ({
    postType,
    isAuthor,
    isCreateAuthorized,
    isModerateAuthorized,
}: PostActionAccessInput): PostActionAccessResult => {
    if (!getPostCreateFeature(postType) || !getPostModerateFeature(postType)) {
        return { ok: false, message: "Post not found" };
    }

    if (isAuthor && isCreateAuthorized) {
        return { ok: true, reason: "author" };
    }

    if (!isAuthor && isModerateAuthorized) {
        return { ok: true, reason: "moderator" };
    }

    return { ok: false, message: "You are not authorized to delete this post" };
};
