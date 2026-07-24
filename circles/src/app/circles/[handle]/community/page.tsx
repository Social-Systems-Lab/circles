import CommunityModule from "@/components/modules/community/community";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { createCommunityFeed } from "@/lib/data/feed";
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound, redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CommunityPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    if (!circle.enabledModules?.includes("community")) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    const canViewCommunity = await isAuthorized(userDid, circle._id.toString(), features.community.view);
    if (!canViewCommunity) {
        const reason = userDid ? "unauthorized" : "unauthenticated";
        redirect(
            `/circles/${circle.handle}/access-denied?reason=${reason}&module=community&redirectTo=${encodeURIComponent(`/circles/${circle.handle}/community`)}`,
        );
    }

    // Created lazily on first authorized Community route visit; no migration or backfill.
    const feed = await createCommunityFeed(circle._id.toString());
    if (!feed) {
        notFound();
    }

    return <CommunityModule circle={JSON.parse(JSON.stringify(circle))} feed={JSON.parse(JSON.stringify(feed))} />;
}
