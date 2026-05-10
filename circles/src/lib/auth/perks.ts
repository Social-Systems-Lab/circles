import type { Circle } from "@/models/models";

type UserSubject = Pick<Circle, "isMember" | "manualMember" | "isAdmin"> | null | undefined;

/** True when the user has paid contributor perks (paid subscription or admin override). */
export function hasContributorPerks(user: UserSubject): boolean {
    return user?.isMember === true || user?.manualMember === true;
}

/** True when the user can post and interact on the platform. */
export function canInteract(user: UserSubject & Pick<Circle, "isVerified" | "verificationStatus">): boolean {
    if (user?.isAdmin) return true;
    if (hasContributorPerks(user)) return true;
    return user?.verificationStatus === "verified" || user?.isVerified === true;
}
