// /src/app/circles/[handle]/post/[postId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { canUserViewPost, getFeed, getPost, getAllComments, getShareablePostPreview } from "@/lib/data/feed";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import { CommentDisplay, PostDisplay } from "@/models/models";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PostItem } from "@/components/modules/feeds/post-list";
import { getUserByDid } from "@/lib/data/user";

type SinglePostPageProps = {
    params: Promise<{ handle: string; postId: string }>;
};

export default async function SinglePostPage(props: SinglePostPageProps) {
    const params = await props.params;
    const userDid = await getAuthenticatedUserDid();
    const postId = params.postId;
    const handle = params.handle;

    // Get the circle by handle
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    // Get the post by ID
    const post = await getPost(postId);
    if (!post) {
        notFound();
    }

    // Get the feed the post belongs to
    const feed = await getFeed(post.feedId);
    if (!feed) {
        console.error(`Feed not found for post: ${postId} with feedId: ${post.feedId}`);
        notFound();
    }

    if (feed.circleId !== circle._id) {
        notFound();
    }

    const canViewPost = await canUserViewPost(post, userDid);
    if (!canViewPost) {
        const reason = userDid ? "unauthorized" : "unauthenticated";
        const moduleHandle =
            post.postType === "community" ? "community" : post.postType === "discussion" ? "discussions" : "feed";
        redirect(
            `/circles/${handle}/access-denied?reason=${reason}&module=${moduleHandle}&redirectTo=${encodeURIComponent(`/circles/${handle}/post/${postId}`)}`,
        );
    }

    // Get all comments for the post
    const comments = (await getAllComments(postId, userDid)) as CommentDisplay[];
    const author = await getUserByDid(post.createdBy);
    const sharedPostData = post.sharedPostId ? await getShareablePostPreview(post.sharedPostId, userDid) : null;

    const postWithComments: PostDisplay = {
        ...post,
        author: author || circle,
        circle,
        feed,
        sharedPostData,
    } as PostDisplay;

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
                            post={postWithComments}
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
