"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { PiQuotesFill } from "react-icons/pi";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { OnboardingStepProps } from "./onboarding";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { completeFinalStep, getPlatformMetrics } from "./actions";
import { PlatformMetrics } from "@/models/models";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

function FinalStep({ nextStep }: OnboardingStepProps) {
    const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | undefined>(undefined);
    const [user, setUser] = useAtom(userAtom);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        getPlatformMetrics().then((metrics) => {
            setPlatformMetrics(metrics);
        });
    }, []);

    const handleComplete = async () => {
        if (!user?._id) {
            nextStep();
            return;
        }

        setIsSubmitting(true);
        try {
            // Mark final step as completed
            await completeFinalStep(user._id);

            // Update local user state
            setUser({
                ...user,
                completedOnboardingSteps: [...(user.completedOnboardingSteps || []), "final"],
            });

            nextStep();
        } catch (error) {
            console.error("Error marking final step complete:", error);
            nextStep(); // Continue anyway
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="relative">
                <div className="hidden h-[200px] w-full md:block">
                    <Image
                        src="/images/cover3.png"
                        alt="Global community"
                        className="mx-auto rounded-lg object-cover"
                        fill
                    />
                </div>
                <div className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black bg-opacity-50 md:block md:flex">
                    <div className="max-w-[350px] rounded-lg bg-white p-4 text-center">
                        <PiQuotesFill className="mx-auto mb-2 text-blue-500" />
                        <p className="mb-2 text-sm italic text-gray-800">
                            &quot;We believe in humanity and that if given the chance to fully nurture, explore and
                            express our true nature as a social and collaborative species we could be a pretty decent
                            curator to the living system that is our planet.&quot;
                        </p>
                        <div className="flex items-center justify-center space-x-2">
                            {/* <Avatar>
                                <AvatarImage src="https://i.pravatar.cc/28" alt="Tim Olson" />
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar> */}
                            <span className="text-sm font-medium">Tim Olsson</span>
                        </div>
                    </div>
                </div>
            </div>
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Welcome, Changemaker!</h2>
            <p className="text-gray-600">
                Your journey in MakeCircles begins now. Here&apos;s a glimpse of the world you&apos;re about to enter:
            </p>
            {platformMetrics ? (
                <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-white p-4">
                        <h3 className="mb-0 mt-0 text-lg font-semibold">{platformMetrics.users}</h3>
                        <p className="text-sm text-gray-500">Fellow changemakers</p>
                    </Card>
                    <Card className="bg-white p-4">
                        <h3 className="mb-0 mt-0 text-lg font-semibold">{platformMetrics.circles}</h3>
                        <p className="text-sm text-gray-500">Circles to follow</p>
                    </Card>
                </div>
            ) : (
                <div className="flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-blue-500" />
                </div>
            )}
            <p className="text-gray-600">
                Get ready to connect with allies, join circles, and embark on world-changing quests!
            </p>
            <p className="text-sm text-gray-600">
                Remember, you&apos;re part of a supportive community. Don&apos;t hesitate to reach out, collaborate, and
                make a difference together!
            </p>
            <div className="mt-4 flex items-center justify-center">
                <Button onClick={handleComplete} className="mx-auto rounded-full" disabled={isSubmitting}>
                    Begin Your Adventure
                </Button>
            </div>
        </div>
    );
}

export default FinalStep;
