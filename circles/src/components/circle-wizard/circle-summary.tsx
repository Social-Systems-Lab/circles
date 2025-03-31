"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CircleData } from "./circle-wizard";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

interface CircleSummaryProps {
    circleData: CircleData;
}

export default function CircleSummary({ circleData }: CircleSummaryProps) {
    const { name, handle, isPublic, mission, description, picture, cover, selectedCauses, selectedSkills, location } =
        circleData;

    return (
        <div className="sticky top-0 w-[240px] space-y-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="relative h-24 w-full overflow-hidden rounded-lg">
                <img src={cover || "/images/default-cover.png"} alt="Cover" className="h-full w-full object-cover" />
            </div>

            <div className="relative -mt-12 flex flex-col items-center">
                <Avatar className="absolute top-[-50px] h-16 w-16 border-4 border-white">
                    <AvatarImage src={picture || "/images/default-picture.png"} alt={name} />
                    <AvatarFallback>{name?.slice(0, 2) || "CI"}</AvatarFallback>
                </Avatar>
                <h3 className="mb-0 mt-3 pb-0 text-center text-lg font-semibold">{name || "Circle Name"}</h3>
                <p className="mb-0 mt-0 text-sm text-gray-500" style={{ marginBottom: 0, marginTop: 0 }}>
                    @{handle || "handle"}
                </p>
                <Badge variant={isPublic ? "default" : "outline"} className="mt-1">
                    {isPublic ? "Public" : "Private"}
                </Badge>
            </div>

            {location && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="h-4 w-4" />
                    <span>{location.city || location.region || location.country || "Location not specified"}</span>
                </div>
            )}

            {description && (
                <div className="space-y-1">
                    <div className="text-md m-0 p-0 pb-0 font-semibold uppercase text-gray-500">About</div>
                    <p className="text-sm text-gray-700">{description}</p>
                </div>
            )}

            {mission && (
                <div className="space-y-1">
                    <div className="text-md m-0 p-0 pb-0 font-semibold uppercase text-gray-500">Mission</div>
                    <p className="text-sm italic text-gray-700">"{mission}"</p>
                </div>
            )}

            {selectedCauses.length > 0 && (
                <div className="space-y-1">
                    <div className="text-md m-0 p-0 pb-0 font-semibold uppercase text-gray-500">Causes</div>
                    <div className="flex flex-wrap gap-1">
                        {selectedCauses.slice(0, 3).map((cause) => (
                            <Badge key={cause.handle} variant="secondary" className="text-xs">
                                {cause.name}
                            </Badge>
                        ))}
                        {selectedCauses.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                                +{selectedCauses.length - 3} more
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {selectedSkills.length > 0 && (
                <div className="space-y-1">
                    <div className="text-md m-0 p-0 pb-1 font-semibold uppercase text-gray-500">Skills</div>
                    <div className="flex flex-wrap gap-1">
                        {selectedSkills.slice(0, 3).map((skill) => (
                            <Badge key={skill.handle} variant="secondary" className="text-xs">
                                {skill.name}
                            </Badge>
                        ))}
                        {selectedSkills.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                                +{selectedSkills.length - 3} more
                            </Badge>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
