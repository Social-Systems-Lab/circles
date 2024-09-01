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
        <div
            className={`${isCompact ? "order-2 flex flex-col gap-3 p-4" : "mt-[70px] flex w-[300px] flex-col gap-3 p-4"}`}
        >
            {circle.interests && circle.interests.length > 0 && (
                <div className="flex flex-col justify-start rounded-lg bg-[#f7f7f7] p-4">
                    <div className="mb-2 font-semibold">Interests</div>
                    <CircleTags tags={circle.interests} showAll={true} isCompact={isCompact} />
                </div>
            )}

            {circle.offers_needs && circle.offers_needs.length > 0 && (
                <div className="flex flex-col justify-start rounded-lg bg-[#f7f7f7] p-4">
                    <div className="mb-2 font-semibold">{circle.circleType === "user" ? "Offers" : "Needs"}</div>
                    <CircleTags tags={circle.offers_needs} showAll={true} isCompact={isCompact} />
                </div>
            )}

            {isDefaultCircle && (
                <div className="flex flex-col justify-start rounded-lg bg-[#f7f7f7] p-4">
                    <div className="mb-2 font-semibold">Version</div>
                    <div>{process.env.version}</div>
                </div>
            )}
        </div>
    );
};

export default CircleSidePanel;
