// CircleSidePanel.tsx
import React from "react";
import { Cause, Circle, Skill } from "@/models/models";
import CircleTags from "../circles/circle-tags";
import { causes, skills } from "@/lib/data/constants";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import Image from "next/image";
import { HoverCardArrow } from "@radix-ui/react-hover-card";

type CauseSkillItemProps = {
    handle: string;
    type: "cause" | "skill";
};

export const CauseSkillItem = ({ handle, type }: CauseSkillItemProps) => {
    const item =
        type == "cause"
            ? (causes.find((x) => x.handle === handle) as Cause)
            : (skills.find((x) => x.handle === handle) as Skill);

    if (!item) return null;

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger>
                <Image
                    src={item.picture.url}
                    alt={item.name}
                    width={50}
                    height={50}
                    className="rounded-full shadow-lg"
                />
            </HoverCardTrigger>
            <HoverCardContent className="z-[500] w-[300px] border-0 bg-[#333333] p-2 pt-[6px]">
                <HoverCardArrow className="text-[#333333]" fill="#333333" color="#333333" />
                <div className="text-[14px] text-white">
                    <div className="font-bold">{item.name}</div>
                    <div className="flex items-center gap-2 text-[12px]">{item.description}</div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};

interface CircleSidePanelProps {
    circle: Circle;
    isCompact: boolean;
    isDefaultCircle: boolean;
}

export const CircleSidePanel: React.FC<CircleSidePanelProps> = ({ circle, isCompact, isDefaultCircle }) => {
    if ((!circle.causes || circle.causes.length <= 0) && (!circle.skills || circle.skills.length <= 0)) {
        return (
            <div className={`${isCompact ? "order-2 flex flex-col gap-3" : "mt-[70px] flex w-[300px] flex-col gap-3"}`}>
                {isDefaultCircle && (
                    <div className="flex flex-col justify-start rounded-lg bg-[#f7f7f7] p-4">
                        <div className="mb-2 font-semibold">Version</div>
                        <div>{process.env.version}</div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className={`m-4 rounded-[15px] bg-white p-4 shadow-lg ${isCompact ? "order-2 flex flex-col gap-3" : "mt-[70px] flex w-[300px] flex-col gap-3"}`}
        >
            {circle.causes && circle.causes.length > 0 && (
                <div>
                    <div className="mb-2 flex items-center text-sm font-semibold">Causes</div>
                    <div className="grid grid-cols-4 gap-2 pb-2">
                        {circle.causes.map((cause) => (
                            <CauseSkillItem key={cause} handle={cause} type="cause" />
                        ))}
                    </div>
                </div>
            )}

            {circle.skills && circle.skills.length > 0 && (
                <div>
                    <div className="mb-2 flex items-center text-sm font-semibold">Skills</div>
                    <div className="grid grid-cols-4 gap-2 pb-2">
                        {circle.skills.map((skill) => (
                            <CauseSkillItem key={skill} handle={skill} type="skill" />
                        ))}
                    </div>
                </div>
            )}

            {/* {circle.interests && circle.interests.length > 0 && (
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
            )} */}

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
