import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { OnboardingUserData } from "./onboarding";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ProfileSummaryProps {
    userData: OnboardingUserData;
}

export default function ProfileSummary({ userData }: ProfileSummaryProps) {
    return (
        <div className="formatted w-64 rounded-lg bg-white p-4 shadow-md">
            <div className="flex flex-col items-center">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={userData.picture} alt={userData.name} />
                    <AvatarFallback>{userData.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <h2 className="mt-4 text-xl font-semibold">{userData.name}</h2>
                <p className="mt-2 text-center text-sm text-gray-600">{userData.mission}</p>
            </div>
            <hr className="my-4" />
            <div>
                <h3 className="text-md font-semibold">SDGs</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                    {userData.selectedSdgs.map((sdg) => (
                        <Popover key={sdg.handle}>
                            <PopoverTrigger>
                                <div className="aspect-square overflow-hidden rounded-lg">
                                    <img src={sdg.picture?.url} alt={sdg.name} className="h-full w-full object-cover" />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent>
                                <h3 className="font-bold">{sdg.name}</h3>
                                <p>{sdg.description}</p>
                            </PopoverContent>
                        </Popover>
                    ))}
                </div>
            </div>
            <div className="mt-4">
                <h3 className="text-md font-semibold">Skills</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                    {userData.selectedSkills.map((skill) => (
                        <Badge key={skill.handle} variant="outline">
                            {skill.name}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    );
}
