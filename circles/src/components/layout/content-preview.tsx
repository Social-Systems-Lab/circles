"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, imageGalleryAtom, mapOpenAtom, triggerMapOpenAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { FaUsers } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import InviteButton from "../modules/home/invite-button";
import JoinButton from "../modules/home/join-button";
import { Circle, ContentPreviewData, FileInfo, Media, PostDisplay, PostItemProps } from "@/models/models";
import { PostItem } from "../modules/feeds/post-list";
import Indicators from "../utils/indicators";

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
    circle: Circle;
};
export const CirclePreview = ({ circle }: CirclePreviewProps) => {
    const router = useRouter();
    const memberCount = circle?.members ? (circle.circleType === "user" ? circle.members - 1 : circle.members) : 0;
    const [, setImageGallery] = useAtom(imageGalleryAtom);

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
    const [mapOpen] = useAtom(mapOpenAtom);
    const isMobile = useIsMobile();

    const closePreview = () => {
        setContentPreview(undefined);
    };

    const getPreviewContent = () => {
        switch (contentPreview?.content?.circleType) {
            default:
            case "member":
            case "user":
            case "circle":
                return <CirclePreview circle={contentPreview!.content as Circle} />;
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

    return (
        <>
            <AnimatePresence>
                {contentPreview && !mapOpen && (
                    <motion.div
                        className="relative flex-shrink-0 bg-[#fbfbfb]"
                        initial={{ width: 0 }}
                        animate={{ width: 420 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        exit={{ width: 0 }}
                    ></motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {contentPreview && (
                    <motion.div
                        initial={{ x: "110%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "110%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={`fixed bottom-4 z-40 w-full overflow-hidden bg-white shadow-lg md:w-[400px] md:rounded-[15px] ${
                            isMobile ? "right-0 top-0" : "right-4 top-[64px]"
                        }`}
                    >
                        {getPreviewContent()}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`absolute ${isMobile ? "right-6 top-[68px]" : "right-2 top-[48px]"} rounded-full bg-gray-100 md:top-2`}
                            onClick={closePreview}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default ContentPreview;
