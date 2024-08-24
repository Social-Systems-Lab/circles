"use client";

import React, { ReactNode } from "react";
import { Circle } from "@/models/models";
import CircleSidePanel from "./circle-side-panel";
import { useIsCompact } from "@/components/utils/use-is-compact";

type HomeModuleWrapperProps = {
    children: ReactNode[];
    circle: Circle;
};

const HomeModuleWrapper: React.FC<HomeModuleWrapperProps> = ({ children, circle }) => {
    const isCompact = useIsCompact();

    const [coverComponent, contentComponent] = children;

    return (
        <div className="flex flex-1 flex-col">
            {coverComponent}
            <div className={`flex ${isCompact ? "flex-col" : "flex-row justify-center"}`}>
                <CircleSidePanel circle={circle} isCompact={isCompact} />
                <div className={`${isCompact ? "w-full" : "flex-1"}`}>{contentComponent}</div>
                {!isCompact && <div className="w-64" />} {/* Right column spacer */}
            </div>
        </div>
    );
};

export default HomeModuleWrapper;
