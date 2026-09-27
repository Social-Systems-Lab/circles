import "server-only";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getMember } from "@/lib/data/member";
import { getUserPrivate } from "@/lib/data/user";
import {
    createCircleMembershipCredentialCard,
    getLinkedVibeIdDid,
    type CircleMembershipCredentialCardData,
} from "@/lib/vibe-id/membership-credentials";
import type { Circle, Member, UserPrivate } from "@/models/models";

export type AboutPageMembershipCredentialDependencies = {
    authenticate: () => Promise<string | undefined>;
    findMember: (userDid: string, circleId: string) => Promise<Member | null>;
    findPrivateUser: (userDid: string) => Promise<UserPrivate>;
    getLinkedIdentity: (user: UserPrivate) => string | null;
    createCredential: (input: {
        circle: Circle;
        member: Member;
        subjectVibeDid: string;
    }) => CircleMembershipCredentialCardData | null;
};

const defaultDependencies: AboutPageMembershipCredentialDependencies = {
    authenticate: getAuthenticatedUserDid,
    findMember: getMember,
    findPrivateUser: getUserPrivate,
    getLinkedIdentity: getLinkedVibeIdDid,
    createCredential: createCircleMembershipCredentialCard,
};

export async function resolveAboutPageMembershipCredential(
    circle: Circle,
    dependencies: AboutPageMembershipCredentialDependencies = defaultDependencies,
): Promise<CircleMembershipCredentialCardData | null> {
    try {
        if (circle.circleType === "user" || !circle._id) return null;

        const authenticatedViewerDid = await dependencies.authenticate();
        if (!authenticatedViewerDid) return null;

        const circleId = String(circle._id);
        const [member, viewer] = await Promise.all([
            dependencies.findMember(authenticatedViewerDid, circleId),
            dependencies.findPrivateUser(authenticatedViewerDid),
        ]);
        if (
            !member ||
            member.userDid !== authenticatedViewerDid ||
            member.circleId !== circleId ||
            viewer.did !== authenticatedViewerDid
        ) {
            return null;
        }

        const linkedVibeDid = dependencies.getLinkedIdentity(viewer);
        if (!linkedVibeDid) return null;

        const credential = dependencies.createCredential({
            circle,
            member,
            subjectVibeDid: linkedVibeDid,
        });
        return credential?.subjectDid === linkedVibeDid ? credential : null;
    } catch {
        return null;
    }
}
