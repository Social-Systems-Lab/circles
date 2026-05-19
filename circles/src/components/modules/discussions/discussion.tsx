// discussion.tsx - component for displaying feeds
"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed, PostDisplay, Cause as SDG } from "@/models/models"; // Removed DynamicForm and Page imports
//import { CreateNewPost } from "./create-new-discussion";
import DiscussionList from "./discussion-list";
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { isAuthorized } from "@/lib/auth/client-auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useEffect } from "react";

export type FeedComponentProps = {
    circle: Circle;
    posts: PostDisplay[];
    feed: Feed;
    onFilterChange?: (filter: string) => void;
    onSdgChange?: (sdgs: SDG[]) => void;
    selectedSdgsExternal?: SDG[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
};

export const DiscussionComponent = ({
    circle,
    posts,
    feed,
    searchQuery,
    setSearchQuery,
}: FeedComponentProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);

    // check if authorized to post
    const canPost = isAuthorized(user, circle, features.discussions.create);

    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.FeedComponent.1");
        }
    }, []);

    return (
        <div
            className={`flex h-full min-h-screen w-full flex-1 items-start justify-center`}
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div className="flex w-full flex-col gap-3">
                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search forum posts by title..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    {canPost && (
                        <Button onClick={() => router.push(`/circles/${circle.handle}/discussions/new`)}>
                            <Plus className="mr-2 h-4 w-4" /> New Forum Post
                        </Button>
                    )}
                </div>
                <DiscussionList posts={posts} feed={feed} circle={circle} />
            </div>
        </div>
    );
};
