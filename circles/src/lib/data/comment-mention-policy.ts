import type { CommentDisplay } from "@/models/models";
import { sanitizeCircleMentionsInTextItems, type MentionContentPolicyDependencies } from "./mention-content-policy";

export function sanitizeCommentMentions(
    comments: readonly CommentDisplay[],
    viewerDid?: string,
    dependencies?: MentionContentPolicyDependencies,
): Promise<CommentDisplay[]> {
    return sanitizeCircleMentionsInTextItems(comments, viewerDid, dependencies);
}
