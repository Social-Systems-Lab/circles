"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ItemCard from "./item-card";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, OnboardingUserData } from "./onboarding";
import { causes } from "@/lib/data/constants";
import { fetchCausesMatchedToCircle, saveCausesAction } from "./actions";
import { Cause } from "@/models/models";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

function CausesStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [causeSearch, setCauseSearch] = useState("");
    const [allCauses, setAllCauses] = useState<Cause[]>([]);
    const [user, setUser] = useAtom(userAtom);

    const visibleCauses = useMemo(() => {
        if (causeSearch) {
            return allCauses.filter(
                (cause) =>
                    cause.name.toLowerCase().includes(causeSearch.toLowerCase()) ||
                    cause.description.toLowerCase().includes(causeSearch.toLowerCase()),
            );
        } else {
            return allCauses;
        }
    }, [allCauses, causeSearch]);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!user) return;

        // Use startTransition to fetch causes based on mission statement
        startTransition(async () => {
            const response = await fetchCausesMatchedToCircle(user!.handle!);
            if (response.success) {
                setAllCauses(response.causes);
            } else {
                setAllCauses(causes);
                console.error(response.message);
            }
        });
    }, [userData.mission]);

    const handleCauseToggle = (cause: Cause) => {
        setUserData((prev: OnboardingUserData) => {
            const newSelectedCauses = prev.selectedCauses.some((c) => c.handle === cause.handle)
                ? prev.selectedCauses.filter((c) => c.handle !== cause.handle)
                : [...prev.selectedCauses, cause];

            return {
                ...prev,
                selectedCauses: newSelectedCauses,
            };
        });
    };

    const handleNext = async () => {
        startTransition(async () => {
            let selectedCauses = userData.selectedCauses.map((x) => x.handle);
            const response = await saveCausesAction(selectedCauses, user?._id);
            if (!response.success) {
                // Handle error
                console.error(response.message);
            } else {
                // Update userAtom
                setUser((prev) => ({ ...prev, causes: selectedCauses }));
            }
            nextStep();
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Choose Your Causes</h2>
            <p className="text-gray-600">Select at least two causes that align with your mission:</p>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search or describe the causes you're passionate about..."
                    value={causeSearch}
                    onChange={(e) => setCauseSearch(e.target.value)}
                    className="pl-10"
                />
            </div>
            <ScrollArea className="h-[360px] w-full rounded-md border-0">
                <div className="grid grid-cols-3 gap-4 p-[4px]">
                    {isPending && (!visibleCauses || visibleCauses.length <= 0) && (
                        <div className="col-span-3 flex items-center justify-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading causes...
                        </div>
                    )}

                    {visibleCauses.map((cause) => (
                        <ItemCard
                            key={cause.handle}
                            item={cause}
                            isSelected={userData.selectedCauses.some((c) => c.handle === cause.handle)}
                            onToggle={handleCauseToggle}
                        />
                    ))}
                </div>
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedCauses.map((cause) => (
                    <SelectedItemBadge key={cause.handle} item={cause} onRemove={handleCauseToggle} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className=" rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedCauses.length < 2 || isPending}
                    className="min-w-[100px] rounded-full"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>{userData.selectedCauses.length < 2 ? "Select at least 2 causes" : "Next"}</>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default CausesStep;
