"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom } from "@/lib/data/atoms";

export const ContentPreview: React.FC = () => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const isMobile = useIsMobile();

    const closePreview = () => {
        setContentPreview(undefined);
    };

    useEffect(() => {
        console.log("ContentPreview", contentPreview);
    }, [contentPreview]);

    return (
        <AnimatePresence>
            {contentPreview && (
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`fixed bottom-1 right-1 z-40 w-full bg-white shadow-lg md:w-[420px] md:rounded-[15px] ${
                        isMobile ? "top-0" : "top-[64px]"
                    }`}
                >
                    <div className="relative h-full overflow-y-auto p-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-[48px] md:top-2"
                            onClick={closePreview}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        {/* Render content here */}
                        <h2 className="text-2xl font-bold">{contentPreview?.name}</h2>
                        <p>{contentPreview?.description}</p>
                        {/* Add more content rendering as needed */}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ContentPreview;
