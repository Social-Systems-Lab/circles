"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { PiQuotesFill } from "react-icons/pi";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { OnboardingStepProps } from "./onboarding";

function FinalStep({ nextStep }: OnboardingStepProps) {
    return (
        <div className="space-y-4">
            <div className="relative">
                <div className="h-[200px] w-full">
                    <Image
                        src="/images/cover3.png"
                        alt="Global community"
                        className="mx-auto rounded-lg object-cover"
                        fill
                    />
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black bg-opacity-50">
                    <div className="max-w-[350px] rounded-lg bg-white p-4 text-center">
                        <PiQuotesFill className="mx-auto mb-2 text-blue-500" />
                        <p className="mb-2 text-sm italic text-gray-800">
                            "Circles has helped me level up my impact! I've connected with amazing people and we're
                            tackling ocean cleanup together."
                        </p>
                        <div className="flex items-center justify-center space-x-2">
                            <Avatar>
                                <AvatarImage src="https://i.pravatar.cc/28" alt="Joe Doe" />
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">Joe Doe</span>
                        </div>
                    </div>
                </div>
            </div>
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Welcome, Changemaker!</h2>
            <p className="text-gray-600">
                Your journey in Circles begins now. Here's a glimpse of the world you're about to enter:
            </p>
            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-white p-4">
                    <h3 className="mb-0 mt-0 text-lg font-semibold">5000+</h3>
                    <p className="text-sm text-gray-500">Fellow changemakers</p>
                </Card>
                <Card className="bg-white p-4">
                    <h3 className="mb-0 mt-0  text-lg font-semibold">50+</h3>
                    <p className="text-sm text-gray-500">Active quests</p>
                </Card>
                <Card className="bg-white p-4">
                    <h3 className="mb-0 mt-0  text-lg font-semibold">50+</h3>
                    <p className="text-sm text-gray-500">Countries represented</p>
                </Card>
                <Card className="bg-white p-4">
                    <h3 className="mb-0 mt-0  text-lg font-semibold">100+</h3>
                    <p className="text-sm text-gray-500">Circles to join</p>
                </Card>
            </div>
            <p className="text-gray-600">
                Get ready to connect with allies, join guilds, and embark on world-changing quests!
            </p>
            <p className="text-sm text-gray-600">
                Remember, you're part of a supportive community. Don't hesitate to reach out, collaborate, and make a
                difference together!
            </p>
            <div className="mt-4 flex items-center justify-center">
                <Button onClick={nextStep} className="mx-auto rounded-full">
                    Begin Your Adventure
                </Button>
            </div>
        </div>
    );
}

export default FinalStep;
