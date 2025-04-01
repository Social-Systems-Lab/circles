// /src/app/circles/[handle]/project/[projectId]/page.tsx
import { getCircleByHandle, getCircleById, updateCircle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Circle, CommentDisplay, Feed, Post } from "@/models/models";
import Image from "next/image";
import RichText from "@/components/modules/feeds/RichText";
import { ProjectCommentsSection } from "@/components/modules/projects/project-comments";
import { FollowButton } from "@/components/modules/home/follow-button";
import { getFeedByHandle, getAllComments, getPost, createPost } from "@/lib/data/feed";

// Helper function to create a shadow post for a project if it doesn't exist
async function ensureShadowPost(
    project: Circle,
    feed: Feed,
    userDid: string,
): Promise<{ commentPostId: string; post: Post | null }> {
    // Check if shadow post already exists
    if (project.metadata?.commentPostId) {
        const post = await getPost(project.metadata.commentPostId);
        if (post) {
            return { commentPostId: project.metadata.commentPostId, post };
        }
    }

    // Create a new shadow post
    console.log("Creating shadow post for project:", project.name);
    const post: Post = {
        feedId: feed._id!,
        createdBy: userDid,
        createdAt: new Date(),
        content: "", // Empty content for shadow post
        reactions: {},
        comments: 0,
        media: [],
        postType: "project", // Mark as project shadow post
        userGroups: ["admins", "moderators", "members", "everyone"],
    };

    try {
        const newPost = await createPost(post);
        console.log("Created shadow post:", newPost._id);

        // Update project metadata
        const updatedProject: Partial<Circle> = {
            _id: project._id,
            metadata: {
                ...project.metadata,
                commentPostId: newPost._id,
            },
        };

        await updateCircle(updatedProject);
        console.log("Updated project metadata with comment post ID");

        return { commentPostId: newPost._id, post: newPost };
    } catch (error) {
        console.error("Failed to create shadow post:", error);
        return { commentPostId: "", post: null };
    }
}

type SingleProjectPageProps = {
    params: Promise<{ handle: string; projectId: string }>;
};

export default async function SingleProjectPage(props: SingleProjectPageProps) {
    const params = await props.params;
    const userDid = await getAuthenticatedUserDid();
    let projectId = params.projectId;
    let handle = params.handle;

    if (!userDid) {
        redirect("/unauthenticated");
    }

    // Get the parent circle by handle
    const parentCircle = await getCircleByHandle(handle);
    if (!parentCircle) {
        redirect("/not-found");
    }

    // Get the project by ID
    const project = await getCircleById(projectId);
    if (!project || project.circleType !== "project") {
        redirect("/not-found");
    }

    // Get the default feed for the circle to use for permissions
    const feed = await getFeedByHandle(parentCircle._id!, "default");

    // Ensure we have a feed for permissions
    if (!feed) {
        console.error(`Default feed not found for circle: ${parentCircle._id}`);
        redirect("/not-found");
    }

    // Ensure we have a shadow post for comments
    const { commentPostId, post } = await ensureShadowPost(project, feed, userDid);
    console.log("Shadow post status:", commentPostId ? "exists" : "missing");

    // Get comments if we have a post
    let comments: CommentDisplay[] = [];
    if (commentPostId && post) {
        comments = (await getAllComments(commentPostId, userDid)) as CommentDisplay[];
        console.log("Loaded comments count:", comments.length);
    }

    return (
        <div className="flex flex-1 flex-col">
            <div className="mb-4 mt-14 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:ml-4 md:mr-4 md:mt-14">
                <div className="w-full max-w-[800px]">
                    <Link href={`/circles/${handle}/projects`}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to projects
                        </Button>
                    </Link>

                    <div className="w-full overflow-hidden rounded-lg bg-white shadow">
                        <div className="p-6 pb-3">
                            <div className="flex items-center justify-between">
                                <h1 className="text-2xl font-bold">{project.name}</h1>
                                <div className="flex-shrink-0">
                                    <div className="ml-4">
                                        <FollowButton circle={project} />
                                    </div>
                                </div>
                            </div>
                            {project.description && <p className="mt-2 text-gray-700">{project.description}</p>}
                        </div>

                        {/* Thinner cover image */}
                        <div className="relative h-[200px] w-full">
                            <Image
                                src={project.cover?.url ?? "/images/default-cover.png"}
                                alt="Project Cover"
                                style={{ objectFit: "cover" }}
                                fill
                                sizes="(max-width: 800px) 100vw, 800px"
                                priority
                            />
                        </div>

                        {/* Project content as rich text */}
                        {project.content && (
                            <div className="mt-4 px-6 pb-6 pt-2">
                                <div className="mb-2 text-lg font-semibold">Project Details</div>
                                <div className="prose prose-sm max-w-none">
                                    <RichText content={project.content} />
                                </div>
                            </div>
                        )}

                        {/* Embedded Comments Section */}
                        <div className="border-t border-gray-100 px-6 py-4">
                            <ProjectCommentsSection
                                project={project}
                                circle={parentCircle}
                                feed={feed as Feed}
                                initialComments={comments}
                                commentPostId={commentPostId}
                                post={post}
                                embedded={true}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
