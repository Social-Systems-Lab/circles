"use client";

import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { OnboardingUserData } from "./onboarding";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import EditableImage from "../modules/home/editable-image";
import EditableField from "../modules/home/editable-field";

type ProfileSummaryProps = {
    userData: OnboardingUserData;
};

function ProfileSummary({ userData }: ProfileSummaryProps) {
    const [user, setUser] = useAtom(userAtom);

    if (!user) {
        return null;
    }

    return (
        <div className="w-64 rounded-[15px] bg-white/90 p-4 shadow-lg backdrop-blur-sm">
            <div className="space-y-4">
                <div className="relative flex flex-col items-center">
                    <div className="relative h-[80px] w-[80px]">
                        <EditableImage
                            id="picture"
                            src={user?.picture?.url ?? "/images/default-picture.png"}
                            alt="Profile Picture"
                            fill
                            className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                            circleId={user?._id!}
                            setCircle={setUser}
                        />
                    </div>
                    <div className="mt-2 text-[18px] font-semibold">
                        <EditableField id="name" value={user?.name ?? ""} circleId={user?._id!} setCircle={setUser} />
                    </div>
                    <p className="text-sm text-gray-500">Aspiring Changemaker</p>
                </div>
                {userData.mission && (
                    <div>
                        <div className="mb-0 mt-0 font-semibold">Mission</div>
                        <p className="text-sm text-gray-600">{userData.mission}</p>
                    </div>
                )}
                {userData.selectedCauses.length > 0 && (
                    <div>
                        <div className="mb-0 mt-0 font-semibold">Causes</div>
                        <div className="flex flex-wrap gap-1">
                            {userData.selectedCauses.map((cause) => (
                                <Badge key={cause.handle} variant="secondary">
                                    {cause.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
                {userData.selectedQuests.length > 0 && (
                    <div>
                        <div className="mb-0 mt-0 font-semibold">Active Quests</div>
                        <div className="flex flex-wrap gap-1">
                            {userData.selectedQuests.map((quest) => (
                                <Badge key={quest.id} variant="secondary">
                                    {quest.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
                {userData.selectedSkills.length > 0 && (
                    <div>
                        <div className="mb-0 mt-0 font-semibold">Skills</div>
                        <div className="flex flex-wrap gap-1">
                            {userData.selectedSkills.map((offer) => (
                                <Badge key={offer.id} variant="secondary">
                                    {offer.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ProfileSummary;
