import { Button } from "@/components/ui/button";
import { CircleWizardStepProps } from "./circle-wizard";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { createCircleAction } from "./actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useRouter } from "next/navigation";

export default function FinalStep({ circleData, setCircleData, prevStep, onComplete }: CircleWizardStepProps) {
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState("");
    const [user] = useAtom(userAtom);
    const router = useRouter();

    const handleCreateCircle = async () => {
        setIsPending(true);
        setError("");

        if (!user) {
            setError("You must be logged in to create a circle.");
            setIsPending(false);
            return;
        }

        const result = await createCircleAction(circleData, user.did);

        if (result.success) {
            // If an onComplete callback is provided, call it with the new circle's ID
            if (onComplete) {
                onComplete(result.data?.circleId);
            } else {
                // Otherwise, redirect to the new circle's page
                router.push(`/circles/${result.data?.handle}`);
            }
        } else {
            setError(result.message || "Failed to create circle. Please try again.");
        }

        setIsPending(false);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-center text-3xl font-bold">Ready to Launch?</h2>
            <p className="text-center text-gray-600">
                You've done a great job setting up your community. Here's a final look at what you've created.
            </p>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-xl font-semibold">Community Summary</h3>
                <div className="space-y-4">
                    <div>
                        <p className="font-medium">Name</p>
                        <p className="text-gray-700">{circleData.name}</p>
                    </div>
                    <div>
                        <p className="font-medium">Mission</p>
                        <p className="text-gray-700">{circleData.mission}</p>
                    </div>
                    <div>
                        <p className="font-medium">SDGs</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {circleData.selectedSdgs.length > 0 ? (
                                circleData.selectedSdgs.map((sdg) => (
                                    <span key={sdg.handle} className="rounded-full bg-gray-200 px-2 py-1 text-xs">
                                        {sdg.name}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-gray-600">No SDGs selected</p>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className="font-medium">Needs</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {circleData.selectedSkills.length > 0 ? (
                                circleData.selectedSkills.map((skill) => (
                                    <span key={skill.handle} className="rounded-full bg-gray-200 px-2 py-1 text-xs">
                                        {skill.name}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-gray-600">No needs selected</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {error && <p className="text-center text-sm text-red-500">{error}</p>}

            <div className="flex items-center justify-between pt-4">
                <Button onClick={prevStep} variant="outline" className="rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button onClick={handleCreateCircle} className="rounded-full" disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                        </>
                    ) : (
                        "Create Community"
                    )}
                </Button>
            </div>
        </div>
    );
}
