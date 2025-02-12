"use client";

import React, { ReactNode, useEffect } from "react";
import { Circle } from "@/models/models";
import CircleSidePanel from "./circle-side-panel";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

type HomeModuleWrapperProps = {
    children: ReactNode[];
    circle: Circle;
    isDefaultCircle: boolean;
};

const HomeModuleWrapper: React.FC<HomeModuleWrapperProps> = ({ children, circle, isDefaultCircle }) => {
    const isCompact = useIsCompact();

    const [coverComponent, contentComponent] = children;

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.HomeModuleWrapper.1");
        }
    }, []);

    return (
        <div className="flex flex-1 flex-col">
            {coverComponent}
            <div className={`flex ${isCompact ? "flex-col" : "flex-row justify-center"}`}>
                <CircleSidePanel circle={circle} isCompact={isCompact} isDefaultCircle={isDefaultCircle} />
                <div className={`${isCompact ? "w-full" : "flex-1"}`}>{contentComponent}</div>
                {!isCompact && <div className="w-64" />} {/* Right column spacer */}
            </div>
        </div>
    );
};

export default HomeModuleWrapper;
