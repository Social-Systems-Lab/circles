"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CircleWizardStepProps } from "./circle-wizard";
import { causes } from "@/lib/data/constants";
import { saveCausesAction } from "./actions";
import { Cause } from "@/models/models";

// Badge component for selected causes
function SelectedCauseBadge({ cause, onRemove }: { cause: Cause; onRemove: (cause: Cause) => void }) {
    return (
        <Badge variant="secondary" className="m-1 cursor-pointer" onClick={() => onRemove(cause)}>
            {cause.name}
            <span className="ml-1">×</span>
        </Badge>
    );
}

// Cause card component
function CauseCard({
    cause,
    isSelected,
    onToggle,
}: {
    cause: Cause;
    isSelected: boolean;
    onToggle: (cause: Cause) => void;
}) {
    return (
        <div
            className={`flex cursor-pointer flex-col items-center rounded-lg border p-3 transition-colors ${
                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"
            }`}
            onClick={() => onToggle(cause)}
        >
            <div className="mb-2 h-12 w-12 overflow-hidden rounded-full">
                <img
                    src={cause.picture?.url || `/images/causes/${cause.handle}.png`}
                    alt={cause.name}
                    className="h-full w-full object-cover"
                />
            </div>
            <h3 className="text-center text-sm font-medium">{cause.name}</h3>
        </div>
    );
}

export default function CausesStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [causeSearch, setCauseSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [causesError, setCausesError] = useState("");

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
            // Save the causes
            const causeHandles = circleData.selectedCauses.map((cause) => cause.handle);
            const result = await saveCausesAction(causeHandles);

            if (result.success) {
                nextStep();
            } else {
                // Handle error
                setCausesError(result.message || "Failed to save causes");
                console.error(result.message);
            }
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Choose Causes</h2>
            <p className="text-gray-500">Select causes that align with your circle's mission:</p>

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
                <div className="grid grid-cols-2 gap-3 p-1 md:grid-cols-3">
                    {visibleCauses.map((cause) => (
                        <CauseCard
                            key={cause.handle}
                            cause={cause}
                            isSelected={circleData.selectedCauses.some((c) => c.handle === cause.handle)}
                            onToggle={handleCauseToggle}
                        />
                    ))}

                    {visibleCauses.length === 0 && (
                        <div className="col-span-3 py-8 text-center text-gray-500">
                            No causes found matching "{causeSearch}"
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="flex flex-wrap">
                {circleData.selectedCauses.map((cause) => (
                    <SelectedCauseBadge key={cause.handle} cause={cause} onRemove={handleCauseToggle} />
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
