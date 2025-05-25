"use client";

import { Button } from "@/components/ui/button";
import { CircleWizardStepProps } from "./circle-wizard";
import { useState, useTransition, useEffect } from "react";
import { Loader2, Check, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function FinalStep({
    circleData,
    setCircleData,
    nextStep,
    prevStep,
    onComplete,
}: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [isCreated, setIsCreated] = useState(!!circleData._id); // Set to true if circle already exists
    const [createdCircleHandle, setCreatedCircleHandle] = useState(circleData.handle || "");
    const router = useRouter();

    // If the circle already exists, we don't need to create it again
    useEffect(() => {
        if (circleData._id) {
            setIsCreated(true);
            setCreatedCircleHandle(circleData.handle);
        }
    }, [circleData._id, circleData.handle]);

    const handleViewCircle = () => {
        // Call nextStep to trigger the onComplete callback in CircleWizard,
        // which will then call the onComplete from CreateCommunityProjectDialog to close it.
        if (nextStep) {
            nextStep(); // This will eventually call onComplete from CircleWizard
        } else if (onComplete) {
            // Fallback if nextStep isn't directly doing the final onComplete call
            // (though it should via CircleWizard's logic)
            onComplete();
        }

        // Then navigate
        if (createdCircleHandle) {
            router.push(`/circles/${createdCircleHandle}`);
        } else if (circleData.handle) {
            // Fallback to circleData.handle if createdCircleHandle wasn't set
            router.push(`/circles/${circleData.handle}`);
        } else {
            // Fallback further if no handle is available (should not happen if creation was successful)
            router.push(circleData.isProjectsPage ? "/projects" : "/circles");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">
                    Create Your {circleData.isProjectsPage ? "Project" : "Community"}
                </h2>
                <p className="text-gray-500">
                    You&apos;re all set! Review your {circleData.isProjectsPage ? "project" : "community"} details and
                    create your {circleData.isProjectsPage ? "project" : "community"}.
                </p>
            </div>

            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <h3 className="text-sm font-semibold uppercase text-gray-500">Basic Info</h3>
                        <p className="text-lg font-medium">{circleData.name}</p>
                        <p className="text-sm text-gray-600">@{circleData.handle}</p>
                        <p className="text-sm text-gray-600">
                            {circleData.isPublic ? "Public" : "Private"}{" "}
                            {circleData.isProjectsPage ? "Project" : "Community"}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase text-gray-500">Mission</h3>
                        <p className="text-sm text-gray-600">{circleData.mission || "No mission specified"}</p>
                    </div>
                </div>

                <div>
                    <h3 className="text-sm font-semibold uppercase text-gray-500">Description</h3>
                    <p className="text-sm text-gray-600">{circleData.description || "No description specified"}</p>
                </div>

                {circleData.location && (
                    <div>
                        <h3 className="text-sm font-semibold uppercase text-gray-500">Location</h3>
                        <p className="text-sm text-gray-600">
                            {circleData.location.city ||
                                circleData.location.region ||
                                circleData.location.country ||
                                "Location not specified"}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <h3 className="text-sm font-semibold uppercase text-gray-500">Causes</h3>
                        <div className="flex flex-wrap gap-1">
                            {circleData.selectedCauses.length > 0 ? (
                                circleData.selectedCauses.map((cause) => (
                                    <span key={cause.handle} className="rounded-full bg-gray-200 px-2 py-1 text-xs">
                                        {cause.name}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-gray-600">No causes selected</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold uppercase text-gray-500">Skills</h3>
                        <div className="flex flex-wrap gap-1">
                            {circleData.selectedSkills.length > 0 ? (
                                circleData.selectedSkills.map((skill) => (
                                    <span key={skill.handle} className="rounded-full bg-gray-200 px-2 py-1 text-xs">
                                        {skill.name}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-gray-600">No skills selected</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full" disabled={isPending || isCreated}>
                    Back
                </Button>

                <Button onClick={handleViewCircle} className="rounded-full">
                    <Check className="mr-2 h-4 w-4" />
                    View {circleData.isProjectsPage ? "Project" : "Community"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
