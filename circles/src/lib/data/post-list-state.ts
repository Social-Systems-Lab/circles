import type { PostDisplay } from "@/models/models";

export type PostUpdateResult =
    | { success: true; message?: string; post: PostDisplay }
    | { success: false; message?: string };

export const replaceUpdatedPost = (posts: PostDisplay[], updatedPost: PostDisplay): PostDisplay[] =>
    posts.map((post) => (post._id === updatedPost._id ? updatedPost : post));

export const applyPostUpdateResult = (posts: PostDisplay[], result: PostUpdateResult): PostDisplay[] =>
    result.success ? replaceUpdatedPost(posts, result.post) : posts;
