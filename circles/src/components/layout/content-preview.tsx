"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { contentPreviewAtom, imageGalleryAtom, userAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { FaUsers } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import InviteButton from "../modules/home/invite-button";
import JoinButton from "../modules/home/join-button";
import { Circle, FileInfo, Media, PostItemProps, WithMetric } from "@/models/models";
import { PostItem } from "../modules/feeds/post-list";
import Indicators from "../utils/indicators";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { MessageButton } from "../modules/home/message-button";

export const PostPreview = ({
    post,
    circle,
    feed,
    page,
    subpage,
    initialComments,
    initialShowAllComments,
}: PostItemProps) => {
    return (
        <>
            <PostItem
                post={post}
                circle={circle}
                feed={feed}
                page={page}
                subpage={subpage}
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
                        <InviteButton circle={circle as Circle} isDefaultCircle={false} renderCompact={true} />
                        <JoinButton circle={circle as Circle} renderCompact={true} />
                    </div>

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
                </div>

                <div className="mb-8 mt-[44px] flex flex-col items-center justify-center overflow-y-auto">
                    <h4>{circle.name}</h4>
                    {circle.description && <div className="pl-4 pr-4">{circle.description}</div>}
                    {memberCount > 0 && (
                        <div className="flex flex-row items-center justify-center pt-4">
                            <FaUsers />
                            <p className="m-0 ml-2">
                                {memberCount}{" "}
                                {memberCount !== 1
                                    ? circle.circleType === "user"
                                        ? "Friends"
                                        : "Members"
                                    : circle.circleType === "user"
                                      ? "Friend"
                                      : "Member"}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </>
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
        let circleType = (contentPreview?.content as any)?.circleType;
        if (!contentPreview) return null;

        switch (circleType) {
            default:
            case "member":
            case "user":
            case "circle":
                return <CirclePreview circle={contentPreview!.content as Circle} circleType={contentPreview.type} />;
            case "post":
                return (
                    <PostPreview
                        post={(contentPreview.props! as PostItemProps).post}
                        circle={(contentPreview.props! as PostItemProps).circle}
                        feed={(contentPreview.props! as PostItemProps).feed}
                        page={(contentPreview.props! as PostItemProps).page}
                        subpage={(contentPreview.props! as PostItemProps).subpage}
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
