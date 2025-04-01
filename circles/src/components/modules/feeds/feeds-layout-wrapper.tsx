"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed } from "@/models/models";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export type FeedsLayoutWrapperProps = {
    circle: Circle;
    children: React.ReactNode;
    isDefaultCircle: boolean;
    feeds: Feed[];
};

export const FeedsLayoutWrapper = ({ children, circle, feeds, isDefaultCircle }: FeedsLayoutWrapperProps) => {
    const isCompact = useIsCompact();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.FeedsLayoutWrapper.1");
        }
    }, []);

    return (
        <div
            className={"flex w-full bg-[#fbfbfb]"}
            style={{
                flexDirection: isCompact ? "column" : "row",
            }}
        >
            <div
                className="relative flex flex-col items-center"
                style={{
                    flex: isCompact ? "0" : "1",
                    alignItems: isCompact ? "normal" : "flex-end",
                    minWidth: isCompact ? "0px" : "240px",
                    paddingTop: isCompact ? "0" : "72px",
                }}
            ></div>
            {children}
        </div>
    );
};
