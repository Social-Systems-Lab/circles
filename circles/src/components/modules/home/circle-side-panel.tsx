// CircleSidePanel.tsx
import React from "react";
import { Circle } from "@/models/models";
import CircleTags from "../circles/circle-tags";

interface CircleSidePanelProps {
    circle: Circle;
    isCompact: boolean;
}

export const CircleSidePanel: React.FC<CircleSidePanelProps> = ({ circle, isCompact }) => {
    return (
        <div className={`${isCompact ? "order-2 p-4" : "mt-[50px] w-64 p-4"}`}>
            <div className="mb-4 flex flex-col justify-start">
                <div className="mb-2 font-semibold">Interests</div>
                <CircleTags tags={circle.interests} showAll={true} isCompact={isCompact} />
            </div>
            <div>
                <div className="mb-2 font-semibold">{circle.circleType === "user" ? "Offers" : "Needs"}</div>
                <CircleTags tags={circle.offers_needs} showAll={true} isCompact={isCompact} />
            </div>
        </div>
    );
};

export default CircleSidePanel;
