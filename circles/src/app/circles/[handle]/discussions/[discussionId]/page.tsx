import { DiscussionItem } from "@/components/modules/discussions/discussion-list";
import { notFound } from "next/navigation";
import { getFeed, getFullPost } from "@/lib/data/feed";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

interface DiscussionDetailPageProps {
    params: Promise<{ handle: string; discussionId: string }>;
}

export default async function DiscussionDetailPage(props: DiscussionDetailPageProps) {
    const { handle, discussionId } = await props.params;
    const viewerDid = await resolveAuthenticatedViewerDid(getAuthenticatedUserDid);
    const post = await getFullPost(discussionId, viewerDid);
    const circle = post?.circle;

    if (!post || !circle || circle.handle !== handle) {
        notFound();
    }

    const feed = await getFeed(post.feedId);

    if (!feed) {
        notFound();
    }

    return (
        <div className="mx-auto max-w-3xl p-6">
            <DiscussionItem post={post} circle={circle} feed={feed} />
        </div>
    );
}
