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
import { MapPin, Quote } from "lucide-react";
import { CirclePicture } from "../modules/circles/circle-picture";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import SdgList from "../modules/sdgs/SdgList";
import SocialLinks from "../modules/home/social-links";

const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));
const skillMap = new Map(skills.map((s) => [s.handle, s]));

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

                {user && circleType === "user" && circle._id !== user?._id && (
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
                        {user && <FollowButton circle={circle as Circle} renderCompact={true} />}
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
                <div className="mt-[44px] flex flex-col items-center justify-center overflow-y-auto">
                    <div className="header pt-[30px] text-2xl">{circle.name}</div>
                    {memberCount > 0 && (
                        <div className="flex flex-row items-center justify-center pt-2">
                            <FaUsers />
                            <p className="m-0 ml-2 text-sm">
                                {memberCount} {memberCount !== 1 ? "Followers" : "Follower"}
                            </p>
                        </div>
                    )}
                    <div className="pt-2">
                        <SocialLinks circle={circle} />
                    </div>
                </div>
                {/* Content below image - now inside the scrollable container */}
                <div className="relative flex flex-1 flex-col p-4 pt-2">
                    {/* Description and Mission are prioritized */}
                    <div className="space-y-3 px-1 pb-2">
                        {/* Mission Box with Quote Icon */}
                        {circle.mission && (
                            <div className="relative mt-3 rounded-md border bg-gray-50/80 p-3 pl-8 shadow-sm">
                                <Quote className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                                <p className="text-sm text-gray-700">{circle.mission}</p>
                            </div>
                        )}

                        {circle.description && <p className="text-sm text-gray-600">{circle.description}</p>}

                        {/* SDGs */}
                        {circle.causes && circle.causes.length > 0 && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">SDGs</h3>
                                <SdgList sdgHandles={circle.causes.slice(0, 8)} className="grid-cols-4" />
                            </div>
                        )}

                        {/* Skills/Needs Pills */}
                        {/* {circle.skills && circle.skills.length > 0 && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">
                                    {circle.circleType === "user" ? "Skills" : "Needs"}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    {circle.skills!.slice(0, 8).map((handle) => {
                                        const skill = skillMap.get(handle);
                                        if (!skill) return null;
                                        return (
                                            <Badge
                                                key={handle}
                                                variant="outline"
                                                className="flex items-center gap-1.5 px-2 py-1"
                                            >
                                                <Image
                                                    src={skill.picture.url}
                                                    alt="" // Alt handled by text
                                                    width={16}
                                                    height={16}
                                                    className="h-4 w-4 rounded-full object-cover"
                                                />
                                                <span className="text-xs font-medium">{skill.name}</span>
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                        )} */}

                        {/* Offers & Skills */}
                        {circle.offers && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">Offers & Skills</h3>
                                {circle.offers.text && <p className="text-sm text-gray-700">{circle.offers.text}</p>}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {circle.offers.skills?.map((skill) => (
                                        <Badge key={skill} variant="outline">
                                            {skill}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Engagement */}
                        {circle.engagements && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">
                                    What I want to engage in
                                </h3>
                                {circle.engagements.text && (
                                    <p className="text-sm text-gray-700">{circle.engagements.text}</p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {circle.engagements.interests?.map((interest) => (
                                        <Badge key={interest} variant="outline">
                                            {interest}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Needs */}
                        {circle.needs && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">
                                    What I need help with
                                </h3>
                                {circle.needs.text && <p className="text-sm text-gray-700">{circle.needs.text}</p>}
                            </div>
                        )}

                        {/* Location (moved down, inline icon, no heading) */}
                        {circle.location &&
                            (circle.location.city || circle.location.region || circle.location.country) && (
                                <div className="flex items-center pt-2 text-sm text-gray-600">
                                    <MapPin className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                                    <span>
                                        {[circle.location.city, circle.location.region, circle.location.country]
                                            .filter(Boolean)
                                            .join(", ")}
                                    </span>
                                </div>
                            )}
                    </div>
                    {/* End of direct content within scroll container */}
                </div>{" "}
            </div>
        </>
    );
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
                return (
                    <div className="custom-scrollbar h-full overflow-y-auto">
                        <CirclePreview circle={circle} circleType={"user"} />
                    </div>
                );
            case "user":
            case "circle": {
                const circleData = contentPreview!.content as WithMetric<Circle>;
                if (!circleData || !circleData.handle) {
                    // Basic validation for circle data
                    console.error("User/Circle preview missing valid circle data:", circleData);
                    return <div className="p-4 text-red-500">Error: Invalid data for User/Circle preview.</div>;
                }
                return (
                    <div className="custom-scrollbar h-full overflow-y-auto">
                        <CirclePreview circle={circleData} circleType={contentPreview.type} />
                    </div>
                );
            }
            case "proposal": {
                // Render ProposalItem in preview mode
                const proposal = contentPreview!.content as ProposalDisplay;
                const props = contentPreview!.props as { circle: Circle } | undefined;
                if (!props) {
                    console.error("Proposal preview missing props data:", proposal);
                    return <div className="p-4 text-red-500">Error: Missing props data for proposal preview.</div>;
                }
                if (!props.circle) {
                    console.error("Proposal preview missing circle data in props:", proposal, props);
                    return (
                        <div className="p-4 text-red-500">
                            Error: Missing circle data in props for proposal preview.
                        </div>
                    );
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
                const props = contentPreview!.props as { circle: Circle; permissions: IssuePermissions } | undefined;
                if (!props) {
                    console.error("Issue preview missing props data:", issue);
                    return <div className="p-4 text-red-500">Error: Missing props data for issue preview.</div>;
                }
                if (!props.circle || !props.permissions) {
                    console.error("Issue preview missing circle or permissions data in props:", issue, props);
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
                            circle={props.circle} // Safe
                            permissions={props.permissions} // Safe
                            currentUserDid={currentUserDid}
                            isPreview={true}
                        />
                    </div>
                );
            }
            case "task": {
                // Render TaskDetail in preview mode
                const task = contentPreview!.content as TaskDisplay;
                const props = contentPreview!.props as { circle: Circle; permissions: TaskPermissions } | undefined;
                if (!props) {
                    console.error("Task preview missing props data:", task);
                    return <div className="p-4 text-red-500">Error: Missing props data for task preview.</div>;
                }
                if (!props.circle || !props.permissions) {
                    console.error("Task preview missing circle or permissions data in props:", task, props);
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
                            circle={props.circle} // Safe
                            permissions={props.permissions} // Safe
                            currentUserDid={currentUserDid}
                            isPreview={true}
                        />
                    </div>
                );
            }
            case "post": {
                const props = contentPreview.props as PostItemProps | undefined;
                if (!props) {
                    console.error("Announcement preview missing props data:", contentPreview.content, props);
                    return <div className="p-4 text-red-500">Error: Missing props data for announcement preview.</div>;
                }
                if (!props.post || !props.circle) {
                    console.error(
                        "Announcement preview missing essential announcement or circle data in props:",
                        contentPreview.content,
                        props,
                    );
                    return <div className="p-4 text-red-500">Error: Missing data for announcement preview.</div>;
                }
                return (
                    <PostPreview
                        post={props.post}
                        circle={props.circle}
                        feed={props.feed}
                        initialComments={props.initialComments}
                        initialShowAllComments={props.initialShowAllComments}
                    />
                );
            }
        }
    };

    if (!contentPreview) {
        return null;
    }

    return <>{getPreviewContent()}</>;
};

export default ContentPreview;
