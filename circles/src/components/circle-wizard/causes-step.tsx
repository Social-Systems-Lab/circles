"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleWizardStepProps } from "./circle-wizard";
import { saveCausesAction } from "./actions";
import { Cause } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ItemGrid, ItemList } from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { causes } from "@/lib/data/causes-skills";

export default function CausesStep({
    circleData,
    setCircleData,
    nextStep,
    prevStep,
    onComplete,
}: CircleWizardStepProps) {
    const [causeSearch, setCauseSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [causesError, setCausesError] = useState("");
    const isMobile = useIsMobile();

    const visibleCauses = useMemo(() => {
        if (causeSearch) {
            return causes.filter(
                (cause) =>
                    cause.name.toLowerCase().includes(causeSearch.toLowerCase()) ||
                    cause.description.toLowerCase().includes(causeSearch.toLowerCase()),
            );
        } else {
            return causes;
        }
    }, [causeSearch]);

    const handleCauseToggle = (cause: Cause) => {
        // Clear any previous errors
        setCausesError("");

        setCircleData((prev) => {
            const isSelected = prev.selectedCauses.some((c) => c.handle === cause.handle);

            if (isSelected) {
                // Remove the cause if it's already selected
                return {
                    ...prev,
                    selectedCauses: prev.selectedCauses.filter((c) => c.handle !== cause.handle),
                };
            } else {
                // Add the cause if it's not already selected
                return {
                    ...prev,
                    selectedCauses: [...prev.selectedCauses, cause],
                };
            }
        });
    };

    const handleNext = () => {
        if (circleData.selectedCauses.length < 1) {
            setCausesError("Please select at least one cause");
            return;
        }

        startTransition(async () => {
            // Get the cause handles
            const causeHandles = circleData.selectedCauses.map((cause) => cause.handle);

            // If we have a circle ID, update the circle with the causes
            if (circleData._id) {
                const result = await saveCausesAction(causeHandles, circleData._id);

                if (result.success) {
                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        if (circle.causes) {
                            // Convert causes array back to Cause objects
                            const updatedCauses = circle.causes.map((handle: string) => {
                                return (
                                    causes.find((c) => c.handle === handle) || { handle, name: handle, description: "" }
                                );
                            });

                            setCircleData((prev) => ({
                                ...prev,
                                selectedCauses: updatedCauses,
                            }));
                        }
                    }
                    nextStep();
                } else {
                    // Handle error
                    setCausesError(result.message || "Failed to save causes");
                    console.error(result.message);
                }
            } else {
                // If no circle ID yet, just store the causes in state and move to the next step
                console.warn("No circle ID yet, causes will be saved when the circle is created");
                nextStep();
            }
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Choose Causes</h2>
            <p className="text-gray-500">
                Select causes that align with your {circleData.isProjectsPage ? "project" : "community"}&apos;s mission:
            </p>

            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search for causes..."
                    value={causeSearch}
                    onChange={(e) => setCauseSearch(e.target.value)}
                    className="pl-10"
                />
            </div>

            <ScrollArea className="h-[360px] w-full rounded-md border-0">
                {isPending && (!visibleCauses || visibleCauses.length <= 0) && (
                    <div className="col-span-3 flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading causes...
                    </div>
                )}

                {isMobile ? (
                    <ItemList
                        items={visibleCauses}
                        selectedItems={circleData.selectedCauses}
                        onToggle={handleCauseToggle}
                    />
                ) : (
                    <ItemGrid
                        items={visibleCauses}
                        selectedItems={circleData.selectedCauses}
                        onToggle={handleCauseToggle}
                        isCause={true}
                    />
                )}

                {visibleCauses.length === 0 && (
                    <div className="col-span-3 py-8 text-center text-gray-500">
                        No causes found matching &quot;{causeSearch}&quot;
                    </div>
                )}
            </ScrollArea>

            <div className="flex flex-wrap">
                {circleData.selectedCauses.map((cause) => (
                    <SelectedItemBadge key={cause.handle} item={cause} onRemove={handleCauseToggle} />
                ))}
            </div>

            {causesError && <p className="text-sm text-red-500">{causesError}</p>}

            <div className="flex justify-between">
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
                        "Next"
                    )}
                </Button>
            </div>
        </div>
    );
}
