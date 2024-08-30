// CircleSidePanel.tsx
import React from "react";
import { Circle } from "@/models/models";
import CircleTags from "../circles/circle-tags";

interface CircleSidePanelProps {
    circle: Circle;
    isCompact: boolean;
    isDefaultCircle: boolean;
}

export const CircleSidePanel: React.FC<CircleSidePanelProps> = ({ circle, isCompact, isDefaultCircle }) => {
    return (
        <div className={`${isCompact ? "order-2 flex flex-col gap-4 p-4" : "mt-[50px] flex w-64 flex-col gap-4 p-4"}`}>
            {circle.interests && circle.interests.length > 0 && (
                <div className="flex flex-col justify-start">
                    <div className="mb-2 font-semibold">Interests</div>
                    <CircleTags tags={circle.interests} showAll={true} isCompact={isCompact} />
                </div>
            )}

            {circle.offers_needs && circle.offers_needs.length > 0 && (
                <div>
                    <div className="mb-2 font-semibold">{circle.circleType === "user" ? "Offers" : "Needs"}</div>
                    <CircleTags tags={circle.offers_needs} showAll={true} isCompact={isCompact} />
                </div>
            )}

            {isDefaultCircle && (
                <div>
                    <div className="mb-2 font-semibold">Version</div>
                    <div>{process.env.version}</div>
                </div>
            )}
        </div>
    );
};

export default CircleSidePanel;
