"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleWizardStepProps } from "./circle-wizard";
import { saveCausesAction } from "./actions";
import { Cause as SDG } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ItemGrid, ItemList } from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { sdgs } from "@/lib/data/sdgs";

export default function SdgsStep({ circleData, setCircleData, nextStep, prevStep, onComplete }: CircleWizardStepProps) {
    const [sdgSearch, setSdgSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [sdgsError, setSdgsError] = useState("");
    const isMobile = useIsMobile();
    const entityLabel = circleData.circleType === "project" ? "Project" : "Community";
    const entityLabelLower = entityLabel.toLowerCase();

    const visibleSdgs = useMemo(() => {
        if (sdgSearch) {
            return sdgs.filter(
                (sdg) =>
                    sdg.name.toLowerCase().includes(sdgSearch.toLowerCase()) ||
                    sdg.description.toLowerCase().includes(sdgSearch.toLowerCase()),
            );
        } else {
            return sdgs;
        }
    }, [sdgSearch]);

    const handleSdgToggle = (sdg: SDG) => {
        // Clear any previous errors
        setSdgsError("");

        setCircleData((prev) => {
            const isSelected = prev.selectedSdgs.some((s) => s.handle === sdg.handle);

            if (isSelected) {
                // Remove the sdg if it's already selected
                return {
                    ...prev,
                    selectedSdgs: prev.selectedSdgs.filter((s) => s.handle !== sdg.handle),
                };
            } else {
                // Add the sdg if it's not already selected
                return {
                    ...prev,
                    selectedSdgs: [...prev.selectedSdgs, sdg],
                };
            }
        });
    };

    const handleNext = () => {
        if (circleData.selectedSdgs.length < 1) {
            setSdgsError("Please select at least one SDG");
            return;
        }

        startTransition(async () => {
            // Get the sdg handles
            const sdgHandles = circleData.selectedSdgs.map((sdg) => sdg.handle);

            // If we have a circle ID, update the circle with the sdgs
            if (circleData._id) {
                const result = await saveCausesAction(sdgHandles, circleData._id);

                if (result.success) {
                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        if (circle.causes) {
                            // Convert causes array back to SDG objects
                            const updatedSdgs = circle.causes.map((handle: string) => {
                                return (
                                    sdgs.find((s) => s.handle === handle) || { handle, name: handle, description: "" }
                                );
                            });

                            setCircleData((prev) => ({
                                ...prev,
                                selectedSdgs: updatedSdgs,
                            }));
                        }
                    }
                    nextStep();
                } else {
                    // Handle error
                    setSdgsError(result.message || "Failed to save SDGs");
                    console.error(result.message);
                }
            } else {
                // If no circle ID yet, just store the sdgs in state and move to the next step
                console.warn("No circle ID yet, SDGs will be saved when the circle is created");
                nextStep();
            }
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Choose SDGs</h2>
            <p className="text-gray-500">
                {`Select Sustainable Development Goals (SDGs) that align with your ${entityLabelLower}'s mission:`}
            </p>

            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search for SDGs..."
                    value={sdgSearch}
                    onChange={(e) => setSdgSearch(e.target.value)}
                    className="pl-10"
                />
            </div>

            <ScrollArea className="h-[360px] w-full rounded-md border-0">
                {isPending && (!visibleSdgs || visibleSdgs.length <= 0) && (
                    <div className="col-span-3 flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading SDGs...
                    </div>
                )}

                {isMobile ? (
                    <ItemList items={visibleSdgs} selectedItems={circleData.selectedSdgs} onToggle={handleSdgToggle} />
                ) : (
                    <ItemGrid
                        items={visibleSdgs}
                        selectedItems={circleData.selectedSdgs}
                        onToggle={handleSdgToggle}
                        isCause={true}
                    />
                )}

                {visibleSdgs.length === 0 && (
                    <div className="col-span-3 py-8 text-center text-gray-500">
                        No SDGs found matching &quot;{sdgSearch}&quot;
                    </div>
                )}
            </ScrollArea>

            <div className="flex flex-wrap">
                {circleData.selectedSdgs.map((sdg) => (
                    <SelectedItemBadge key={sdg.handle} item={sdg} onRemove={handleSdgToggle} />
                ))}
            </div>

            {sdgsError && <p className="text-sm text-red-500">{sdgsError}</p>}

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
