"use client";

import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, mapOpenAtom, userToolboxStateAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import ContentPreview from "./content-preview";
import { UserToolbox } from "./user-toolbox";

export const SidePanel: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [userToolbox, setUserToolbox] = useAtom(userToolboxStateAtom);
    const [mapOpen] = useAtom(mapOpenAtom);
    const isMobile = useIsMobile();
    const [sidePanelContentVisible, setSidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

    const closeContentPreview = () => {
        setContentPreview(undefined);
    };

    const closeUsertoolbox = () => {
        setUserToolbox(undefined);
    };

    useEffect(() => {
        if (contentPreview) {
            setSidePanelContentVisible("content");
        } else if (!userToolbox) {
            setSidePanelContentVisible(undefined);
        }
    }, [contentPreview]);

    useEffect(() => {
        if (userToolbox) {
            setSidePanelContentVisible("toolbox");
        } else if (!contentPreview) {
            setSidePanelContentVisible(undefined);
        }
    }, [userToolbox]);

    return (
        <>
            <AnimatePresence>
                {(contentPreview || userToolbox) && !mapOpen && (
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
                        style={{ zIndex: sidePanelContentVisible === "content" ? 50 : 40 }}
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
                {userToolbox && (
                    <motion.div
                        initial={{ x: "110%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "110%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        style={{ zIndex: sidePanelContentVisible === "toolbox" ? 50 : 40 }}
                        className={`fixed bottom-4 z-40 w-full overflow-hidden bg-white shadow-lg md:w-[400px] md:rounded-[15px] ${
                            isMobile ? "right-0 top-0" : "right-4 top-[64px]"
                        }`}
                    >
                        <UserToolbox />
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`absolute ${isMobile ? "right-6 top-[68px]" : "right-2 top-[48px]"} rounded-full bg-gray-100 md:top-2`}
                            onClick={closeUsertoolbox}
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
