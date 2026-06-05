/**
 * Contributor perks and interaction gates.
 *
 * PRINCIPLE: signupOrder, foundingMemberNumber, verifiedAt, foundingMemberGrantedAt,
 * verifiedBy, and related fields are admin-only operational metadata for queue
 * management and audit. They must NEVER be surfaced in user-facing UI.
 *
 * The only user-visible distinction is "Supporter" (hasContributorPerks === true).
 * Paid (isMember), founding (isFoundingMember), and admin-override (manualMember)
 * all render identically as "Supporter" to other users.
 *
 * One exception: a founding member can see their own founding badge on their own
 * profile. Use canSeeFoundingBadge() to enforce this — never derive it inline.
 */

import type { Circle } from "@/models/models";

type UserSubject =
    | Pick<Circle, "isMember" | "isFoundingMember" | "manualMember" | "accountStatus" | "isAdmin">
    | null
    | undefined;

/** True when the user has paid contributor perks. manualMember bypasses the status guard. */
export function hasContributorPerks(user: UserSubject): boolean {
    if (user?.manualMember === true) return true;
    if (user?.accountStatus !== "active") return false;
    return user?.isMember === true || user?.isFoundingMember === true;
}

/** True when the user can post and interact on the platform. */
export function canInteract(user: UserSubject): boolean {
    if (user?.isAdmin === true) return true;
    return user?.accountStatus === "active";
}

/**
 * True only when a user is viewing their own profile and they are a founding member.
 * The founding badge is a quiet personal reminder — never visible to other users.
 */
export function canSeeFoundingBadge(
    viewerDid: string | null | undefined,
    target: Pick<Circle, "did" | "isFoundingMember"> | null | undefined,
): boolean {
    if (!viewerDid || !target?.did) return false;
    return viewerDid === target.did && target.isFoundingMember === true;
}
