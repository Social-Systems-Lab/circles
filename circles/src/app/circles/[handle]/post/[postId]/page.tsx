// /src/app/circles/[handle]/post/[postId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { getFeed, getPost, getAllComments } from "@/lib/data/feed";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { CommentDisplay, PostDisplay } from "@/models/models";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PostItem } from "@/components/modules/feeds/post-list";

type SinglePostPageProps = {
  params: Promise<{ handle: string; postId: string }>;
};

export default async function SinglePostPage(props: SinglePostPageProps) {
  const params = await props.params;
  const userDid = await getAuthenticatedUserDid();
  let postId = params.postId;
  let handle = params.handle;
  
console.log("handle", handle, "postId", postId);

  if (!userDid) {
    redirect("/unauthenticated");
  }

  // Get the circle by handle
  const circle = await getCircleByHandle(handle);
  if (!circle) {
    redirect("/not-found");
  }

  // Get the post by ID
  const post = await getPost(postId);
  if (!post) {
    redirect("/not-found");
  }
  
  // Get the feed the post belongs to
  const feed = await getFeed(post.feedId);
  if (!feed) {
    console.error(`Feed not found for post: ${postId} with feedId: ${post.feedId}`);
    redirect("/not-found");
  }
  
  console.log(`Single post view: ${postId} in feed: ${feed.handle} of circle: ${circle.name}`);
  
  // Get all comments for the post
  const comments = await getAllComments(postId, userDid) as CommentDisplay[];

  const postWithComments: PostDisplay = {
    ...post,
    author: circle
  } as PostDisplay;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
        <div className="w-full max-w-[600px]">
          <Link href={`/circles/${handle}/feeds/${feed.handle === "default" ? "" : feed.handle ?? ""}`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to {feed.name || 'feed'}
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