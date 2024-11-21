"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FaQuoteRight } from "react-icons/fa6";
import { saveMissionAction, fetchMissionStatements } from "./actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { OnboardingStepProps } from "./onboarding";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { MissionDisplay } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";

function MissionStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const [missionStatements, setMissionStatements] = useState<MissionDisplay[]>([]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setUserData((prev) => ({ ...prev, [name]: value }));
    };

    const handleNext = async () => {
        startTransition(async () => {
            const response = await saveMissionAction(userData.mission, user?._id);
            if (!response.success) {
                // Handle error
                console.error(response.message);
            } else {
                // Update userAtom
                setUser((prev) => ({ ...prev, mission: userData.mission }));
            }
            nextStep();
        });
    };

    useEffect(() => {
        if (!user?.handle) return;

        const fetchMissions = async () => {
            const response = await fetchMissionStatements(user._id!);
            if (response.success) {
                setMissionStatements(response.missions);
            } else {
                console.error("Failed to fetch mission statements:", response.message);
            }
        };
        fetchMissions();
    }, [user?.handle]);
    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Your Mission</h2>
            <p className="text-gray-600">Define your purpose and the change you want to see in the world.</p>
            {missionStatements.length > 0 && (
                <div className="relative mb-4 h-64 w-full rounded-lg pl-4 pr-4">
                    <Carousel>
                        <CarouselContent>
                            {missionStatements.map((missionItem, index) => (
                                <CarouselItem key={index}>
                                    <Card className="relative h-full bg-gray-100 p-4">
                                        <div className="relative mx-auto flex flex-row items-center justify-center gap-2">
                                            <FaQuoteRight size="28px" className="mb-2 text-blue-500" />
                                        </div>
                                        <p className="mb-2 select-none text-sm italic text-gray-800">
                                            {missionItem.mission}
                                        </p>
                                        <div className="absolute bottom-0 right-0 flex flex-row items-center justify-center gap-2 p-2 pr-4">
                                            <Avatar className="h-[28px] w-[28px]">
                                                <AvatarImage src={missionItem.picture} alt={missionItem.name} />
                                                <AvatarFallback>{missionItem.name.slice(0, 2)}</AvatarFallback>
                                            </Avatar>
                                            <span className="select-none text-sm font-medium">{missionItem.name}</span>
                                        </div>
                                    </Card>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                    </Carousel>
                </div>
            )}

            {/* 
            <Card className="relative mb-4 bg-gray-100 p-4">
                <div className="relative mx-auto flex flex-row items-center justify-center gap-2">
                    <FaQuoteRight size="28px" className="mb-2 text-blue-500" />
                </div>

                <p className="mb-2 text-sm italic text-gray-800">
                    My mission is to create a world where every child has access to quality education, regardless of
                    their background. I believe that by empowering young minds, we can solve the world's most pressing
                    challenges and create a brighter future for all.
                </p>

                <div className="absolute bottom-0 right-0 flex flex-row items-center justify-center gap-2 p-2 pr-4">
                    <Avatar className="h-[28px] w-[28px]">
                        <AvatarImage src="https://i.pravatar.cc/28" alt="Alex Lee" />
                        <AvatarFallback>AL</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">Alex Lee</span>
                </div>
            </Card> */}
            <div className="space-y-2">
                <Label htmlFor="mission">What is your mission in this world?</Label>
                <Textarea
                    id="mission"
                    name="mission"
                    value={userData.mission}
                    onChange={handleInputChange}
                    placeholder="Share your vision for a better world"
                    className="h-32"
                />
            </div>
            <p className="text-sm text-gray-500">
                Remember, all information provided during this onboarding process can be changed later.
            </p>
            <div className="flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button onClick={handleNext} className="w-[100px] rounded-full" disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>Next</>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default MissionStep;
