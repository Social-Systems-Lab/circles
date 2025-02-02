// skills-step.tsx

"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import SelectedItemBadge from "./selected-item-badge";
import { OnboardingStepProps, OnboardingUserData } from "./onboarding";
import { skills } from "@/lib/data/constants";
import { fetchSkillsMatchedToCircle, saveSkillsAction } from "./actions";
import { Skill } from "@/models/models";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ItemGrid, ItemList } from "./item-card";
import { useIsMobile } from "../utils/use-is-mobile";

function SkillsStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [skillSearch, setSkillSearch] = useState("");
    const [allSkills, setAllSkills] = useState<Skill[]>([]);
    const [user, setUser] = useAtom(userAtom);
    const isMobile = useIsMobile();

    const visibleSkills = useMemo(() => {
        if (skillSearch) {
            return allSkills.filter(
                (skill) =>
                    skill.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                    skill.description.toLowerCase().includes(skillSearch.toLowerCase()),
            );
        } else {
            return allSkills;
        }
    }, [allSkills, skillSearch]);

    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!user) return;

        // Use startTransition to fetch skills based on mission statement
        startTransition(async () => {
            const response = await fetchSkillsMatchedToCircle(user._id!);
            if (response.success) {
                setAllSkills(response.skills);
            } else {
                setAllSkills(skills);
                console.error(response.message);
            }
        });
    }, [userData.mission]);

    const handleSkillToggle = (skill: Skill) => {
        setUserData((prev) => {
            if (!prev) return prev;
            const newSelectedSkills = prev.selectedSkills.some((c) => c.handle === skill.handle)
                ? prev.selectedSkills.filter((c) => c.handle !== skill.handle)
                : [...prev.selectedSkills, skill];

            return {
                ...prev,
                selectedSkills: newSelectedSkills,
            };
        });
    };

    const handleNext = async () => {
        startTransition(async () => {
            let selectedSkills = userData.selectedSkills.map((x) => x.handle);
            const response = await saveSkillsAction(selectedSkills, user?._id);
            if (!response.success) {
                // Handle error
                console.error(response.message);
            } else {
                // Update userAtom
                setUser((prev) => {
                    if (!prev) return prev;
                    return { ...prev, skills: selectedSkills, memberships: prev.memberships || [] };
                });
            }
            nextStep();
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="mb-0 mt-0 text-2xl  font-semibold text-gray-800">Your Skills and Powers</h2>
            <p className="text-gray-600">Choose the abilities you bring to your mission:</p>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search or describe what you can offer..."
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    className="pl-10"
                />
            </div>
            <ScrollArea className="h-[360px] w-full rounded-md border-0">
                {isPending && (!visibleSkills || visibleSkills.length <= 0) && (
                    <div className="col-span-3 flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading skills...
                    </div>
                )}

                {isMobile ? (
                    <ItemList
                        items={visibleSkills}
                        selectedItems={userData.selectedSkills}
                        onToggle={handleSkillToggle}
                    />
                ) : (
                    <ItemGrid
                        items={visibleSkills}
                        selectedItems={userData.selectedSkills}
                        onToggle={handleSkillToggle}
                        isCause={false}
                    />
                )}
            </ScrollArea>
            <div className="flex flex-wrap">
                {userData.selectedSkills.map((skill) => (
                    <SelectedItemBadge key={skill.handle} item={skill} onRemove={handleSkillToggle} />
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
                <Button onClick={prevStep} variant="outline" className=" rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={userData.selectedSkills.length < 2 || isPending}
                    className="min-w-[100px] rounded-full"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>{userData.selectedSkills.length < 1 ? "Select at least 1 skill" : "Next"}</>
                    )}
                </Button>
            </div>
        </div>
    );
}

export default SkillsStep;
