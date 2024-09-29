"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FaQuoteRight } from "react-icons/fa6";
import { saveMissionAction } from "./actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { OnboardingStepProps } from "./onboarding";
import { useEffect, useTransition } from "react";
import { Loader2 } from "lucide-react";

function MissionStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();

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
        console.log("MissionStep mounted");
    }, []);

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Your Mission</h2>
            <p className="text-gray-600">Define your purpose and the change you want to see in the world.</p>
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
            </Card>
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
