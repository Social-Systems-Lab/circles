"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getPostsAction } from "@/components/modules/feeds/actions";
import { Circle, Feed, PostDisplay } from "@/models/models";
import { CommunityFeed } from "./community-feed";
import { CommunityComposer } from "./community-composer";
import { getCommunityComposerState, shouldGuardCommunityInteractions } from "@/lib/community-participation";
import type { ParticipationBlockReason } from "@/lib/profile-completion";

type CommunityModuleProps = {
    circle: Circle;
    feed: Feed;
    hasPostPermission: boolean;
    canParticipate: boolean;
    participationBlockReason: ParticipationBlockReason | null;
    canModerate: boolean;
};

export default function CommunityModule({
    circle,
    feed,
    hasPostPermission,
    canParticipate,
    participationBlockReason,
    canModerate,
}: CommunityModuleProps) {
    const [posts, setPosts] = useState<PostDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [, startTransition] = useTransition();
    const composerState = getCommunityComposerState({
        hasPostPermission,
        canParticipate,
        participationBlockReason,
    });
    const guardInteractions = shouldGuardCommunityInteractions({
        hasPostPermission,
        canParticipate,
        participationBlockReason,
    });

    const fetchPosts = useCallback(async () => {
        setIsLoading(true);
        startTransition(async () => {
            try {
                const communityPosts = await getPostsAction(feed._id, circle._id, 20, 0, "new", undefined, "community");
                setPosts(communityPosts);
            } finally {
                setIsLoading(false);
            }
        });
    }, [circle._id, feed._id]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    return (
        <div className="flex flex-1 justify-center overflow-hidden">
            <div className="mb-4 mt-2 flex w-full max-w-[1280px] flex-col items-center md:ml-4 md:mr-4">
                <div className="w-full max-w-[700px]">
                    {composerState === "enabled" && <CommunityComposer circle={circle} feed={feed} onCreated={fetchPosts} />}
                    {composerState === "guarded" && participationBlockReason && (
                        <CommunityComposer
                            circle={circle}
                            feed={feed}
                            onCreated={fetchPosts}
                            participationBlockReason={participationBlockReason}
                        />
                    )}
                </div>
                <CommunityFeed
                    posts={posts}
                    feed={feed}
                    circle={circle}
                    isLoading={isLoading}
                    readOnly={!hasPostPermission && !canModerate}
                    participationBlockReason={guardInteractions ? participationBlockReason : null}
                />
            </div>
        </div>
    );
}
