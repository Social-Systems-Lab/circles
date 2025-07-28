import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { OnboardingUserData } from "./onboarding";

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
                <div className="mt-2 flex flex-wrap gap-2">
                    {userData.selectedSdgs.map((sdg) => (
                        <Badge key={sdg.handle} variant="outline">
                            {sdg.name}
                        </Badge>
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
