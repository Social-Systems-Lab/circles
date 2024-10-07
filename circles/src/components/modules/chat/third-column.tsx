"use client";

import { useAtom } from "jotai";
import { contentPreviewAtom, userAtom } from "@/lib/data/atoms";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { useEffect } from "react";
import { useAnimation, motion } from "framer-motion";

export function ThirdColumn() {
    const [contentPreview] = useAtom(contentPreviewAtom);
    const isCompact = useIsCompact();
    const controls = useAnimation();

    useEffect(() => {
        if (contentPreview !== undefined) {
            controls.start({ flexBasis: "calc(100% / 3 - 210px)" });
        } else {
            controls.start({ flexBasis: "calc(100% / 3)" });
        }
    }, [contentPreview, controls]);

    if (isCompact) {
        return null;
    }

    return (
        <motion.div
            className="min-w-[24px]"
            style={{
                flexBasis: contentPreview ? "calc(100% / 3 - 210px)" : "calc(100% / 3)",
                transition: "flex-basis 0.3s ease",
            }}
        >
            {/* Column 3 content (if any) */}
        </motion.div>
    );
}
