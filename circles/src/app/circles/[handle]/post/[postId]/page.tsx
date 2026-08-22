// /src/app/circles/[handle]/post/[postId]/page.tsx
import { getFullPost } from "@/lib/data/feed";
import { getReadablePostComments, resolveReadablePostContext } from "@/lib/data/post-access-policy";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { notFound } from "next/navigation";
import { CommentDisplay } from "@/models/models";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PostItem } from "@/components/modules/feeds/post-list";

type SinglePostPageProps = {
    params: Promise<{ handle: string; postId: string }>;
};

export default async function SinglePostPage(props: SinglePostPageProps) {
    const params = await props.params;
    const userDid = await resolveAuthenticatedViewerDid(getAuthenticatedUserDid);
    const postId = params.postId;
    const handle = params.handle;

    const context = await resolveReadablePostContext(postId, userDid);
    if (!context) notFound();
    const { feed, circle } = context;

    if (circle.handle !== handle) {
        notFound();
    }

    // Get all comments for the post
    const commentResult = await getReadablePostComments(postId, userDid);
    if (!commentResult.success) notFound();
    const comments = (commentResult.comments ?? []) as CommentDisplay[];
    const sanitizedPost = await getFullPost(postId, userDid);
    if (!sanitizedPost) notFound();

    return (
        <div className="flex flex-1 flex-col">
            <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
                <div className="w-full max-w-[600px]">
                    <Link href={`/circles/${handle}/${feed.handle === "community" ? "community" : "feed"}`}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to {feed.name || "feed"}
                        </Button>
                    </Link>

                    <div className="w-full">
                        <PostItem
                            post={sanitizedPost}
                            circle={circle}
                            feed={feed}
                            initialComments={comments}
                            initialShowAllComments={true}
                            isAggregateFeed={false}
                            inPreview={false}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
