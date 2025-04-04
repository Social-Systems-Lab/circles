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
import { Circle, FileInfo, Media, MemberDisplay, Post, PostItemProps, WithMetric } from "@/models/models";
import { PostItem } from "../modules/feeds/post-list";
import Indicators from "../utils/indicators";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MessageButton } from "../modules/home/message-button";
import { ProposalDisplay, ProposalStage } from "@/models/models"; // Import Proposal types
import { Badge } from "@/components/ui/badge"; // Import Badge
import RichText from "../modules/feeds/RichText"; // Import RichText
import { UserPicture } from "../modules/members/user-picture"; // Import UserPicture
import { formatDistanceToNow } from "date-fns"; // Import date formatting

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
    const [, setImageGallery] = useAtom(imageGalleryAtom);
    const [user] = useAtom(userAtom);

    const handleImageClick = (name: string, image?: FileInfo) => {
        if (!image?.url) return;
        let media: Media = {
            name: name,
            type: "image",
            fileInfo: image,
        };
        setImageGallery({ images: [media], initialIndex: 0 });
    };

    return (
        <>
            <div className="relative h-[270px] w-full">
                <Image
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    style={{
                        objectFit: "cover",
                    }}
                    sizes="100vw"
                    fill
                    onClick={() => handleImageClick("Cover Image", circle?.cover)}
                />

                {circle?.metrics && (
                    <Indicators metrics={circle.metrics} className="absolute left-2 top-2" content={circle} />
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

                    {circleType !== "project" && (
                        <div className="absolute top-[-60px]">
                            <div className="h-[124px] w-[124px]">
                                <Image
                                    className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                    src={circle?.picture?.url ?? "/images/default-picture.png"}
                                    alt="Picture"
                                    fill
                                    onClick={() => handleImageClick("Profile Picture", circle?.picture)}
                                />
                            </div>
                        </div>
                    )}
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

// Simple component to render Proposal preview
type ProposalPreviewProps = {
    proposal: ProposalDisplay;
};
const ProposalPreview: React.FC<ProposalPreviewProps> = ({ proposal }) => {
    const router = useRouter();
    const [, setContentPreview] = useAtom(contentPreviewAtom);

    const navigateToProposal = () => {
        if (proposal.circle?.handle && proposal._id) {
            router.push(`/circles/${proposal.circle.handle}/proposals/${proposal._id}`);
            setContentPreview(undefined); // Close preview on navigation
        }
    };

    const navigateToAuthor = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering proposal navigation
        if (proposal.author?.handle) {
            router.push(`/circles/${proposal.author.handle}`);
            setContentPreview(undefined); // Close preview on navigation
        }
    };

    return (
        <div className="flex h-full flex-col overflow-y-auto p-4">
            <div className="mb-2 flex items-start justify-between">
                <h4 className="cursor-pointer pb-1 text-lg font-semibold hover:underline" onClick={navigateToProposal}>
                    {proposal.name}{" "}
                    <Badge className={`${getProposalStageBadgeColor(proposal.stage)} ml-1 translate-y-[-2px]`}>
                        {proposal.stage.charAt(0).toUpperCase() + proposal.stage.slice(1)}
                    </Badge>
                </h4>
            </div>
            <div
                className="mb-4 flex cursor-pointer items-center space-x-2 text-sm text-muted-foreground"
                onClick={navigateToAuthor}
            >
                <UserPicture name={proposal.author.name} picture={proposal.author.picture?.url} size="24px" />
                <span>{proposal.author.name}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}</span>
            </div>

            <div className="prose prose-sm mb-4 max-w-none flex-grow">
                <RichText content={proposal.description} />
            </div>
            {/* TODO: Add simplified action buttons if needed */}
            <Button onClick={navigateToProposal} className="mt-auto">
                View Full Proposal
            </Button>
        </div>
    );
};

export const ContentPreview: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);

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
            case "proposal":
                return <ProposalPreview proposal={contentPreview!.content as ProposalDisplay} />;
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

// Component to load project comments for the content preview
type ProjectCommentsSectionLoaderProps = {
    projectId: string;
    parentCircleId: string;
    commentPostId: string;
    embedded?: boolean;
};

export default ContentPreview;
