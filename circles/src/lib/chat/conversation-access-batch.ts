import type { Circle } from "@/models/models";
import { evaluateConversationAccess, type ConversationAccessSubject } from "./conversation-access-policy";

type CandidateConversation = ConversationAccessSubject & { _id: { toString(): string }; circleId?: string; updatedAt?: Date };
type MembershipRow = { userDid?: string; circleId?: string; chatRoomId?: unknown; status?: string; active?: boolean; isActive?: boolean };

export type ConversationBatchDependencies<T extends CandidateConversation> = {
    findCanonicalMemberships(viewerDid: string): Promise<MembershipRow[]>;
    findCandidates(viewerDid: string, canonicalCircleIds: string[]): Promise<T[]>;
    findOwningCircles(circleIds: string[]): Promise<Partial<Circle>[]>;
    findChatMemberships(conversationIds: string[]): Promise<MembershipRow[]>;
};

export const isActiveChatMembership = (membership?: MembershipRow | null): boolean => {
    if (!membership) return false;
    const status = typeof membership.status === "string" ? membership.status.toLowerCase() : undefined;
    if (status && status !== "active") return false;
    return membership.active !== false && membership.isActive !== false;
};

/** Production sidebar authorization stage. It performs no hydration or writes. */
export const loadAuthorizedConversationCandidates = async <T extends CandidateConversation>(
    viewerDid: string,
    dependencies: ConversationBatchDependencies<T>,
): Promise<{ conversations: T[]; ownerCircles: Partial<Circle>[]; memberships: MembershipRow[] }> => {
    const canonicalRows = await dependencies.findCanonicalMemberships(viewerDid);
    const canonicalCircleIds = Array.from(
        new Set(canonicalRows.map((row) => row.circleId).filter((id): id is string => typeof id === "string")),
    );
    const candidates = await dependencies.findCandidates(viewerDid, canonicalCircleIds);
    const candidateCircleIds = Array.from(
        new Set(candidates.map((conversation) => conversation.circleId).filter((id): id is string => typeof id === "string")),
    );
    const candidateIds = candidates.map((conversation) => conversation._id.toString());
    const [ownerCircles, memberships] = await Promise.all([
        dependencies.findOwningCircles(candidateCircleIds),
        dependencies.findChatMemberships(candidateIds),
    ]);
    const ownerById = new Map(ownerCircles.map((circle) => [circle._id?.toString?.() || "", circle]));
    const canonicalIdSet = new Set(canonicalCircleIds);
    const activeViewerRoomIds = new Set(
        memberships
            .filter((membership) => membership.userDid === viewerDid && isActiveChatMembership(membership))
            .map((membership) => membership.chatRoomId?.toString?.() || String(membership.chatRoomId)),
    );
    const conversations = candidates.filter((conversation) =>
        evaluateConversationAccess({
            conversation,
            viewerDid,
            intent: "read",
            ownerCircle: conversation.circleId ? ownerById.get(conversation.circleId) : null,
            canonicalMember: Boolean(conversation.circleId && canonicalIdSet.has(conversation.circleId)),
            chatMember: activeViewerRoomIds.has(conversation._id.toString()),
        }),
    );
    return { conversations, ownerCircles, memberships };
};

