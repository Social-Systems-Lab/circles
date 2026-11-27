import CommunityModule from "@/components/modules/community/community";
import { isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { createCommunityFeed } from "@/lib/data/feed";
import { buildClientFeedDto, buildFeedCircleDto } from "@/lib/data/client-circle-dto";
import { getCirclePageAccess } from "../circle-page-access";
import { getMember } from "@/lib/data/member";
import { getUserPrivate } from "@/lib/data/user";
import { canParticipate, getParticipationBlockReason } from "@/lib/profile-completion";
import type { Circle, Feature } from "@/models/models";
import { notFound, redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
};

const hasFeatureGroupPermission = async (
    userDid: string | undefined,
    circle: Circle,
    feature: Feature,
): Promise<boolean> => {
    const allowedUserGroups = circle.accessRules?.[feature.module]?.[feature.handle] ?? feature.defaultUserGroups ?? [];

    if (allowedUserGroups.includes("everyone")) {
        return true;
    }

    if (!userDid || !circle._id) {
        return false;
    }

    const membership = await getMember(userDid, circle._id.toString());
    const memberGroups = membership?.userGroups ?? [];
    return allowedUserGroups.some((group) => memberGroups.includes(group));
};

export default async function CommunityPage(props: PageProps) {
    const { handle } = await props.params;
    const access = await getCirclePageAccess(handle);
    if (!access) notFound();
    const { circle, viewerDid: userDid } = access;
    if (!circle._id || !circle.enabledModules?.includes("community")) notFound();

    const canViewCommunity = await isAuthorized(userDid, circle._id, features.community.view);
    if (!canViewCommunity) {
        const reason = userDid ? "unauthorized" : "unauthenticated";
        redirect(
            `/circles/${circle.handle}/access-denied?reason=${reason}&module=community&redirectTo=${encodeURIComponent(`/circles/${circle.handle}/community`)}`,
        );
    }
    const user = userDid ? await getUserPrivate(userDid) : undefined;
    const participationBlockReason = getParticipationBlockReason(user);
    const isParticipationReady = canParticipate(user);
    const hasPostPermission = await hasFeatureGroupPermission(userDid, circle, features.community.post);
    const canModerateCommunity = await isAuthorized(userDid, circle._id.toString(), features.community.moderate);

    // Created lazily on first authorized Community route visit; no migration or backfill.
    const feed = await createCommunityFeed(circle._id.toString());
    if (!feed) {
        notFound();
    }

    return (
        <CommunityModule
            circle={buildFeedCircleDto(circle, "community")}
            feed={buildClientFeedDto(feed)}
            hasPostPermission={hasPostPermission}
            canParticipate={isParticipationReady}
            participationBlockReason={participationBlockReason}
            canModerate={canModerateCommunity}
        />
    );
}
