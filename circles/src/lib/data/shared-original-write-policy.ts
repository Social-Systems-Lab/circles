import { ObjectId } from "mongodb";
import type { SharedOriginalPreview } from "@/models/models";

export const ORIGINAL_POST_UNAVAILABLE = "Original post unavailable.";

type ResolveShareablePreview = (postId: string, userDid?: string) => Promise<SharedOriginalPreview | null>;

const resolveCanonicalShareablePreview: ResolveShareablePreview = async (postId, userDid) => {
    const { getShareablePostPreview } = await import("./post-nested-content-policy");
    return getShareablePostPreview(postId, userDid);
};

export async function resolveSharedOriginalForWrite(
    candidateId: string,
    writerDid: string,
    resolvePreview: ResolveShareablePreview = resolveCanonicalShareablePreview,
): Promise<string> {
    if (!ObjectId.isValid(candidateId) || !/^[a-fA-F0-9]{24}$/.test(candidateId)) {
        throw new Error(ORIGINAL_POST_UNAVAILABLE);
    }
    const canonicalId = new ObjectId(candidateId).toHexString();
    if (!(await resolvePreview(canonicalId, writerDid))) throw new Error(ORIGINAL_POST_UNAVAILABLE);
    return canonicalId;
}
