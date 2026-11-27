import { getFullPost } from "@/lib/data/feed";
import { getReadablePostComments, resolveReadablePostContext } from "@/lib/data/post-access-policy";
import { buildClientFeedDto, buildPostCircleDto } from "@/lib/data/client-circle-dto";
import { getCirclePageAccess } from "../../circle-page-access";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PostItem } from "@/components/modules/feeds/post-list";

type SinglePostPageProps = {
    params: Promise<{ handle: string; postId: string }>;
};

export default async function SinglePostPage(props: SinglePostPageProps) {
    const { handle, postId } = await props.params;
    const access = await getCirclePageAccess(handle);
    if (!access) notFound();
    const { viewerDid } = access;

    const context = await resolveReadablePostContext(postId, viewerDid);
    if (!context || context.circle._id !== access.circle._id || context.circle.handle !== handle) notFound();
    const { circle, feed, post } = context;

    // Get all comments for the post
    const commentResult = await getReadablePostComments(postId, viewerDid);
    if (!commentResult.success) notFound();
    const comments = commentResult.comments ?? [];
    const sanitizedPost = await getFullPost(postId, viewerDid);
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
                            circle={buildPostCircleDto(circle, post.postType)}
                            feed={buildClientFeedDto(feed)}
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
