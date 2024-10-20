"use client";

import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import {
    contentPreviewAtom,
    imageGalleryAtom,
    mapOpenAtom,
    triggerMapOpenAtom,
    userToolboxAtom,
} from "@/lib/data/atoms";
import Image from "next/image";
import { FaUsers } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import InviteButton from "../modules/home/invite-button";
import JoinButton from "../modules/home/join-button";
import { Circle, ContentPreviewData, FileInfo, Media, PostDisplay, PostItemProps } from "@/models/models";
import { PostItem } from "../modules/feeds/post-list";
import Indicators from "../utils/indicators";
import ContentPreview from "./content-preview";

export const SidePanel: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [userToolbox, setUserToolbox] = useAtom(userToolboxAtom);
    const [mapOpen] = useAtom(mapOpenAtom);
    const isMobile = useIsMobile();

    const closeContentPreview = () => {
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
                        <ContentPreview />
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`absolute ${isMobile ? "right-6 top-[68px]" : "right-2 top-[48px]"} rounded-full bg-gray-100 md:top-2`}
                            onClick={closeContentPreview}
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
