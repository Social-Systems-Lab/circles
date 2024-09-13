"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, mapOpenAtom, triggerMapOpenAtom } from "@/lib/data/atoms";
import Image from "next/image";
import { FaUsers } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import InviteButton from "../modules/home/invite-button";
import JoinButton from "../modules/home/join-button";
import { Circle } from "@/models/models";

export const ContentPreview: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [mapOpen] = useAtom(mapOpenAtom);
    const [triggerMapOpen] = useAtom(triggerMapOpenAtom);
    const isMobile = useIsMobile();
    const router = useRouter();
    const memberCount = contentPreview?.members
        ? contentPreview.circleType === "user"
            ? contentPreview.members - 1
            : contentPreview.members
        : 0;

    const closePreview = () => {
        setContentPreview(undefined);
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
                        <div className="relative h-[270px] w-full">
                            <Image
                                src={contentPreview?.cover?.url ?? "/images/default-cover.png"}
                                alt="Cover"
                                style={{
                                    objectFit: "cover",
                                }}
                                sizes="100vw"
                                fill
                            />
                        </div>
                        <div className="flex flex-1 flex-col">
                            <div className="relative flex justify-center">
                                <div className="absolute left-1 top-1 flex w-[100px]">
                                    <Button
                                        variant="outline"
                                        className="m-2 w-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/circles/${contentPreview.handle}`);
                                        }}
                                    >
                                        Open
                                    </Button>
                                </div>
                                <div className="absolute bottom-[-45px] right-2 flex flex-row gap-1">
                                    <InviteButton
                                        circle={contentPreview as Circle}
                                        isDefaultCircle={false}
                                        renderCompact={true}
                                    />
                                    <JoinButton circle={contentPreview as Circle} renderCompact={true} />
                                </div>

                                <div className="absolute top-[-60px]">
                                    <div className="h-[124px] w-[124px]">
                                        <Image
                                            className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                            src={contentPreview?.picture?.url ?? "/images/default-picture.png"}
                                            alt="Picture"
                                            fill
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mb-8 mt-[44px] flex flex-col items-center justify-center overflow-y-auto">
                                <h4>{contentPreview.name}</h4>
                                {contentPreview.description && (
                                    <div className="pl-4 pr-4">{contentPreview.description}</div>
                                )}
                                {memberCount > 0 && (
                                    <div className="flex flex-row items-center justify-center pt-4">
                                        <FaUsers />
                                        <p className="m-0 ml-2">
                                            {memberCount}{" "}
                                            {memberCount !== 1
                                                ? contentPreview.circleType === "user"
                                                    ? "Friends"
                                                    : "Members"
                                                : contentPreview.circleType === "user"
                                                  ? "Friend"
                                                  : "Member"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

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
