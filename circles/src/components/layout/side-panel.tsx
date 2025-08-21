"use client";

import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import {
    contentPreviewAtom,
    mapOpenAtom,
    userToolboxDataAtom,
    sidePanelContentVisibleAtom,
    sidePanelModeAtom,
    sidePanelSearchStateAtom,
} from "@/lib/data/atoms";
import ContentPreview from "./content-preview";
import { UserToolbox } from "./user-toolbox";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import ActivityPanel from "./activity-panel";
import SearchResultsPanel from "./search-results-panel";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

export const SidePanel: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [userToolbox, setUserToolbox] = useAtom(userToolboxDataAtom);
    const [mapOpen] = useAtom(mapOpenAtom);
    const isMobile = useIsMobile();
    const [sidePanelContentVisible, setSidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const [sidePanelMode, setSidePanelMode] = useAtom(sidePanelModeAtom);
    const [searchPanelState] = useAtom(sidePanelSearchStateAtom);
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.SidePanel.1");
        }
    }, []);

    // Sync panel open state with URL on desktop for /explore
    useEffect(() => {
        if (isMobile) return;
        if (pathname !== "/explore") return;
        const panel = searchParams.get("panel");
        if (panel === "activity" || panel === "search") {
            setSidePanelMode(panel as any);
        }
        // If panel param is absent, don't force-close — allow programmatic open (e.g., search) to persist.
        // Navigation to Explore button will explicitly setSidePanelMode("none").
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMobile, pathname, searchParams]);

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

    if (isMobile && sidePanelContentVisible !== "toolbox") {
        return null;
    }

    return (
        <>
            {/* Left side panel (desktop only) */}
            <AnimatePresence>
                {!isMobile && sidePanelMode !== "none" && (
                    <motion.div
                        className="fixed left-[72px] top-0 z-[200] h-[100vh] flex-shrink-0 bg-[#fbfbfb] md:border-r md:shadow-sm"
                        initial={{ width: 0 }}
                        animate={{ width: 420 }}
                        exit={{ width: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        {/* Close (top-right, smaller) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 z-[210] rounded-full bg-gray-100"
                            onClick={() => {
                                setSidePanelMode("none");
                                if (pathname === "/explore") {
                                    router.push("/explore");
                                }
                            }}
                            aria-label="Close panel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>

                        {/* Panel content (no header, content starts at top) */}
                        <div className="flex h-full w-full flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto">
                                {sidePanelMode === "activity" ? <ActivityPanel /> : <SearchResultsPanel />}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Existing right-floating overlays remain unchanged */}
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
