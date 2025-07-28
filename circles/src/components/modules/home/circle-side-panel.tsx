import Image from "next/image";
import { Circle, Skill } from "@/models/models";
import { skills } from "@/lib/data/skills";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import SdgList from "../sdgs/SdgList";

type CauseSkillItemProps = {
    handle: string;
    type: "skill";
};

const CauseSkillItem: React.FC<CauseSkillItemProps> = ({ handle, type }) => {
    const item = skills.find((x) => x.handle === handle) as Skill;

    if (!item) {
        return null;
    }

    return (
        <HoverCard>
            <HoverCardTrigger>
                <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gray-200">
                    <Image src={item.picture.url} alt={item.name} width={40} height={40} className="rounded-full" />
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="formatted">
                <p className="text-lg font-semibold">{item.name}</p>
                <p className="text-sm">{item.description}</p>
            </HoverCardContent>
        </HoverCard>
    );
};

interface CircleSidePanelProps {
    circle: Circle;
    isCompact?: boolean;
}

export const CircleSidePanel: React.FC<CircleSidePanelProps> = ({ circle, isCompact }) => {
    if ((!circle.causes || circle.causes.length <= 0) && (!circle.skills || circle.skills.length <= 0)) {
        return (
            <div className="rounded-lg bg-white p-4 text-center text-gray-500">
                <h3 className="text-lg font-semibold">No SDGs or Skills</h3>
                <p className="text-sm">This circle has not specified any SDGs or skills.</p>
            </div>
        );
    }

    return (
        <div className={`rounded-lg bg-white p-4 ${isCompact ? "max-h-[200px] overflow-y-auto" : ""}`}>
            {circle.causes && circle.causes.length > 0 && (
                <div>
                    <h3 className="mb-2 text-lg font-semibold">Sustainable Development Goals (SDGs)</h3>
                    <SdgList sdgHandles={circle.causes} />
                </div>
            )}
            {circle.skills && circle.skills.length > 0 && (
                <div>
                    <h3 className="mb-2 text-lg font-semibold">Skills</h3>
                    <div className="grid grid-cols-4 gap-2">
                        {circle.skills.map((skill) => (
                            <CauseSkillItem key={skill} handle={skill} type="skill" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
