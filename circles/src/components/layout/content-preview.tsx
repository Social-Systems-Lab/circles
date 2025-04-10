"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { contentPreviewAtom, imageGalleryAtom, userAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { FaUsers } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import InviteButton from "../modules/home/invite-button";
import FollowButton from "../modules/home/follow-button";
import {
    Circle,
    FileInfo,
    Media,
    MemberDisplay,
    Post,
    PostItemProps,
    WithMetric,
    ProposalDisplay,
    ProposalStage,
    IssueDisplay,
    IssuePermissions,
    TaskDisplay, // Added TaskDisplay
    TaskPermissions, // Added TaskPermissions
} from "@/models/models";
import { PostItem } from "../modules/feeds/post-list";
import Indicators from "../utils/indicators";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MessageButton } from "../modules/home/message-button";
import { Badge } from "@/components/ui/badge";
import ImageCarousel from "@/components/ui/image-carousel";
import { ProposalItem } from "../modules/proposals/proposal-item";
import IssueDetail from "../modules/issues/issue-detail";
import TaskDetail from "../modules/tasks/task-detail"; // Added TaskDetail import

export const PostPreview = ({ post, circle, feed, initialComments, initialShowAllComments }: PostItemProps) => {
    return (
        <>
            <PostItem
                post={post}
                circle={circle}
                feed={feed}
                inPreview={true}
                initialComments={initialComments}
                initialShowAllComments={initialShowAllComments}
            />
        </>
    );
};

type CirclePreviewProps = {
    circle: WithMetric<Circle>;
    circleType: string;
};
export const CirclePreview = ({ circle, circleType }: CirclePreviewProps) => {
    const router = useRouter();
    const memberCount = circle?.members ? (circleType === "user" ? circle.members - 1 : circle.members) : 0;
    const [, setImageGallery] = useAtom(imageGalleryAtom); // Keep for profile picture click
    const [user] = useAtom(userAtom); // Keep user state here for CirclePreview specific logic if needed

    // Keep handleImageClick for the profile picture
    const handleProfilePicClick = (name: string, image?: FileInfo) => {
        if (!image?.url) return;
        let media: Media = {
            name: name,
            type: "image",
            fileInfo: image,
        };
        setImageGallery({ images: [media], initialIndex: 0 });
    };

    // Prepare images for the carousel, providing a default if none exist
    const carouselImages: Media[] =
        circle.images && circle.images.length > 0
            ? circle.images
            : [
                  {
                      name: "Default Cover",
                      type: "image/png",
                      fileInfo: { url: "/images/default-cover.png" },
                  },
              ];

    return (
        <>
            {/* Replace static Image with ImageCarousel */}
            <div className="relative h-[270px] w-full">
                <ImageCarousel
                    images={carouselImages}
                    options={{ loop: carouselImages.length > 1 }}
                    containerClassName="h-full"
                    imageClassName="object-cover"
                />

                {circle?.metrics && (
                    <Indicators metrics={circle.metrics} className="absolute left-2 top-2 z-10" content={circle} /> // Added z-10
                )}

                {circleType === "user" && circle._id !== user?._id && (
                    <div className="absolute bottom-[10px] left-2 flex flex-row">
                        <MessageButton circle={circle as Circle} renderCompact={false} />
                    </div>
                )}
            </div>
            <div className="flex flex-1 flex-col">
                <div className="relative flex justify-center">
                    <div className="absolute left-1 top-1 flex w-[100px]">
                        <Button
                            variant="outline"
                            className="m-2 w-full"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/circles/${circle.handle}`);
                            }}
                        >
                            Open
                        </Button>
                    </div>
                    <div className="absolute bottom-[-45px] right-2 flex flex-row gap-1">
                        <InviteButton circle={circle as Circle} renderCompact={true} />
                        <FollowButton circle={circle as Circle} renderCompact={true} />
                    </div>

                    <div className="absolute top-[-60px]">
                        <div className="h-[124px] w-[124px]">
                            <Image
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Picture"
                                fill
                                onClick={() => handleProfilePicClick("Profile Picture", circle?.picture)} // Use updated handler name
                            />
                        </div>
                    </div>
                </div>

                <div className="mb-8 mt-[44px] flex flex-col items-center justify-center overflow-y-auto">
                    <h4>{circle.name}</h4>
                    {circle.description && <div className="pl-4 pr-4">{circle.description}</div>}

                    {memberCount > 0 && (
                        <div className="flex flex-row items-center justify-center pt-4">
                            <FaUsers />
                            <p className="m-0 ml-2">
                                {memberCount} {memberCount !== 1 ? "Followers" : "Follower"}
                            </p>
                        </div>
                    )}
                </div>
                {/* <div>
                    <pre>{JSON.stringify(circle, null, 2)}</pre>
                </div> */}
            </div>
        </>
    );
};

// Helper function for proposal stage badge color (copied from proposals-list)
const getProposalStageBadgeColor = (stage: ProposalStage) => {
    switch (stage) {
        case "draft":
            return "bg-gray-200 text-gray-800";
        case "review":
            return "bg-blue-200 text-blue-800";
        case "voting":
            return "bg-green-200 text-green-800";
        case "resolved":
            return "bg-purple-200 text-purple-800";
        default:
            return "bg-gray-200 text-gray-800";
    }
};

// Removed the old ProposalPreview component definition

export const ContentPreview: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [user] = useAtom(userAtom); // Move user state here for broader access

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ContentPreview.1");
        }
    }, []);

    const getPreviewContent = () => {
        if (!contentPreview) return null;

        switch (contentPreview.type) {
            default:
            case "member":
                let circle = { ...contentPreview!.content } as Circle;
                circle._id = (contentPreview!.content as MemberDisplay).circleId;
                return <CirclePreview circle={circle} circleType={"user"} />;
            case "user":
            case "circle":
            case "project":
                return <CirclePreview circle={contentPreview!.content as Circle} circleType={contentPreview.type} />;
            case "proposal": {
                // Render ProposalItem in preview mode
                const proposal = contentPreview!.content as ProposalDisplay;
                const props = contentPreview!.props as { circle: Circle }; // Get props
                if (!props.circle) {
                    console.error("Proposal preview missing circle data:", proposal);
                    return <div className="p-4 text-red-500">Error: Missing circle data for proposal preview.</div>;
                }
                return (
                    <div className="custom-scrollbar h-full overflow-y-auto">
                        {/* Pass circle from props */}
                        <ProposalItem proposal={proposal} circle={props.circle} isPreview={true} />
                    </div>
                );
            }
            case "issue": {
                // Render IssueDetail in preview mode
                const issue = contentPreview!.content as IssueDisplay;
                const props = contentPreview!.props as { circle: Circle; permissions: IssuePermissions }; // Get props
                if (!props.circle || !props.permissions) {
                    console.error("Issue preview missing circle or permissions data:", issue, props);
                    return (
                        <div className="p-4 text-red-500">
                            Error: Missing circle or permissions data for issue preview.
                        </div>
                    );
                }
                // Need currentUserDid for IssueDetail
                const currentUserDid = user?.did; // Get from userAtom
                if (!currentUserDid) {
                    console.error("Issue preview missing currentUserDid");
                    return <div className="p-4 text-red-500">Error: Missing user data for issue preview.</div>;
                }
                return (
                    <div className="custom-scrollbar h-full overflow-y-auto">
                        <IssueDetail
                            issue={issue}
                            circle={props.circle}
                            permissions={props.permissions}
                            currentUserDid={currentUserDid} // Pass the current user's DID
                            isPreview={true} // Pass the isPreview flag
                        />
                    </div>
                );
            }
            case "task": {
                // Render TaskDetail in preview mode
                const task = contentPreview!.content as TaskDisplay;
                const props = contentPreview!.props as { circle: Circle; permissions: TaskPermissions }; // Get props
                if (!props.circle || !props.permissions) {
                    console.error("Task preview missing circle or permissions data:", task, props);
                    return (
                        <div className="p-4 text-red-500">
                            Error: Missing circle or permissions data for task preview.
                        </div>
                    );
                }
                const currentUserDid = user?.did;
                if (!currentUserDid) {
                    console.error("Task preview missing currentUserDid");
                    return <div className="p-4 text-red-500">Error: Missing user data for task preview.</div>;
                }
                return (
                    <div className="custom-scrollbar h-full overflow-y-auto">
                        <TaskDetail
                            task={task}
                            circle={props.circle}
                            permissions={props.permissions}
                            currentUserDid={currentUserDid}
                            isPreview={true}
                        />
                    </div>
                );
            }
            case "post":
                return (
                    <PostPreview
                        post={(contentPreview.props! as PostItemProps).post}
                        circle={(contentPreview.props! as PostItemProps).circle}
                        feed={(contentPreview.props! as PostItemProps).feed}
                        initialComments={(contentPreview.props! as PostItemProps).initialComments}
                        initialShowAllComments={(contentPreview.props! as PostItemProps).initialShowAllComments}
                    />
                );
        }
    };

    if (!contentPreview) {
        return null;
    }

    return <>{getPreviewContent()}</>;
};

export default ContentPreview;
