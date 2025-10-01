import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CircleData } from "./circle-wizard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CircleSummaryProps {
    circleData: CircleData;
}

export default function CircleSummary({ circleData }: CircleSummaryProps) {
    const { name, mission, selectedSdgs, selectedSkills, picture } = circleData;
    const entityLabel = circleData.circleType === "project" ? "Project" : "Community";
    const entityLabelLower = entityLabel.toLowerCase();

    return (
        <div className="formatted w-64 rounded-lg bg-white p-4 shadow-md">
            <div className="flex flex-col items-center">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={picture} alt={name} />
                    <AvatarFallback>{name ? name.charAt(0) : "C"}</AvatarFallback>
                </Avatar>
                <h2 className="mt-4 text-xl font-semibold">{name || `${entityLabel} Name`}</h2>
                <p className="mt-2 text-center text-sm text-gray-600">{mission || `${entityLabel} mission...`}</p>
            </div>
            <hr className="my-4" />
            <div>
                <h3 className="text-md font-semibold">SDGs</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                    {selectedSdgs.length > 0 ? (
                        selectedSdgs.map((sdg) => (
                            <Popover key={sdg.handle}>
                                <PopoverTrigger>
                                    <div className="aspect-square overflow-hidden rounded-lg">
                                        <img
                                            src={sdg.picture?.url}
                                            alt={sdg.name}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                </PopoverTrigger>
                                <PopoverContent>
                                    <h3 className="font-bold">{sdg.name}</h3>
                                    <p>{sdg.description}</p>
                                </PopoverContent>
                            </Popover>
                        ))
                    ) : (
                        <p className="col-span-3 text-sm text-gray-500">No SDGs selected</p>
                    )}
                </div>
            </div>
            {/* <div className="mt-4">
                <h3 className="text-md font-semibold">Needs</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                    {selectedSkills.length > 0 ? (
                        selectedSkills.map((skill) => (
                            <Badge key={skill.handle} variant="outline">
                                {skill.name}
                            </Badge>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No needs selected</p>
                    )}
                </div>
            </div> */}
        </div>
    );
}
