"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, OnboardingUserData } from "./onboarding";
import { saveSdgsAction } from "./actions";
import { Cause as SDG } from "@/models/models";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useIsMobile } from "../utils/use-is-mobile";
import { ItemGrid, ItemList } from "./item-card";
import { sdgs } from "@/lib/data/sdgs";

function SdgsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [sdgSearch, setSdgSearch] = useState("");
    const [allSdgs, setAllSdgs] = useState<SDG[]>([]);
    const [user, setUser] = useAtom(userAtom);
    const isMobile = useIsMobile();

    const visibleSdgs = useMemo(() => {
        if (sdgSearch) {
            return allSdgs.filter(
                (sdg) =>
                    sdg.name.toLowerCase().includes(sdgSearch.toLowerCase()) ||
                    sdg.description.toLowerCase().includes(sdgSearch.toLowerCase()),
            );
        } else {
            return allSdgs;
        }
    }, [allSdgs, sdgSearch]);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!user) return;

        // Use startTransition to fetch sdgs based on mission statement
        startTransition(async () => {
            // TODO: Implement a similar function for SDGs if needed
            // const response = await fetchSdgsMatchedToCircle(user!._id.toString()!);
            // if (response.success) {
            //     setAllSdgs(response.sdgs);
            // } else {
            //     setAllSdgs(sdgs);
            //     console.error(response.message);
            // }
            setAllSdgs(sdgs);
        });
    }, [user, userData.mission]);

    const handleSdgToggle = (sdg: SDG) => {
        setUserData((prev) => {
            if (!prev) return prev;
            const newSelectedSdgs = prev.selectedSdgs.some((s) => s.handle === sdg.handle)
                ? prev.selectedSdgs.filter((s) => s.handle !== sdg.handle)
                : [...prev.selectedSdgs, sdg];

            return {
                ...prev,
                selectedSdgs: newSelectedSdgs,
            };
        });
    };

    const handleNext = async () => {
        startTransition(async () => {
            let selectedSdgs = userData.selectedSdgs.map((x) => x.handle);
            const response = await saveSdgsAction(selectedSdgs, user?._id);
            if (!response.success) {
                // Handle error
                console.error(response.message);
            } else {
                // Update userAtom
                setUser((prev) => {
                    if (!prev) return prev;
                    return { ...prev, causes: selectedSdgs };
                });
            }
            nextStep();
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Choose Your SDGs</h2>
            <p className="text-gray-600">
                Select at least two Sustainable Development Goals (SDGs) that align with your mission:
            </p>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search or describe the SDGs you're passionate about..."
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
                    <ItemList items={visibleSdgs} selectedItems={userData.selectedSdgs} onToggle={handleSdgToggle} />
                ) : (
                    <ItemGrid
                        items={visibleSdgs}
                        selectedItems={userData.selectedSdgs}
                        onToggle={handleSdgToggle}
                        isCause={true}
                    />
                )}
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedSdgs.map((sdg) => (
                    <SelectedItemBadge key={sdg.handle} item={sdg} onRemove={handleSdgToggle} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className=" rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedSdgs.length < 2 || isPending}
                    className="min-w-[100px] rounded-full"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>{userData.selectedSdgs.length < 2 ? "Select at least 2 SDGs" : "Next"}</>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default SdgsStep;
