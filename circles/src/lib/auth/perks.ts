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
