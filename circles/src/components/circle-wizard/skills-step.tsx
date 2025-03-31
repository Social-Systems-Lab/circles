"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleWizardStepProps } from "./circle-wizard";
import { skills } from "@/lib/data/constants";
import { saveSkillsAction } from "./actions";
import { Skill } from "@/models/models";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ItemGrid, ItemList } from "./item-card";
import SelectedItemBadge from "./selected-item-badge";

export default function SkillsStep({
    circleData,
    setCircleData,
    nextStep,
    prevStep,
    onComplete,
}: CircleWizardStepProps) {
    const [skillSearch, setSkillSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [skillsError, setSkillsError] = useState("");
    const isMobile = useIsMobile();

    const visibleSkills = useMemo(() => {
        if (skillSearch) {
            return skills.filter(
                (skill) =>
                    skill.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                    skill.description.toLowerCase().includes(skillSearch.toLowerCase()),
            );
        } else {
            return skills;
        }
    }, [skillSearch]);

    const handleSkillToggle = (skill: Skill) => {
        // Clear any previous errors
        setSkillsError("");

        setCircleData((prev) => {
            const isSelected = prev.selectedSkills.some((s) => s.handle === skill.handle);

            if (isSelected) {
                // Remove the skill if it's already selected
                return {
                    ...prev,
                    selectedSkills: prev.selectedSkills.filter((s) => s.handle !== skill.handle),
                };
            } else {
                // Add the skill if it's not already selected
                return {
                    ...prev,
                    selectedSkills: [...prev.selectedSkills, skill],
                };
            }
        });
    };

    const handleNext = () => {
        if (circleData.selectedSkills.length < 1) {
            setSkillsError("Please select at least one skill");
            return;
        }

        startTransition(async () => {
            // Get the skill handles
            const skillHandles = circleData.selectedSkills.map((skill) => skill.handle);

            // If we have a circle ID, update the circle with the skills
            if (circleData._id) {
                const result = await saveSkillsAction(skillHandles, circleData._id);

                if (result.success) {
                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        if (circle.skills) {
                            // Convert skills array back to Skill objects
                            const updatedSkills = circle.skills.map((handle: string) => {
                                return (
                                    skills.find((s) => s.handle === handle) || { handle, name: handle, description: "" }
                                );
                            });

                            setCircleData((prev) => ({
                                ...prev,
                                selectedSkills: updatedSkills,
                            }));
                        }
                    }
                    nextStep();
                } else {
                    // Handle error
                    setSkillsError(result.message || "Failed to save skills");
                    console.error(result.message);
                }
            } else {
                // If no circle ID yet, just store the skills in state and move to the next step
                console.warn("No circle ID yet, skills will be saved when the circle is created");
                nextStep();
            }
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Choose Needs</h2>
            <p className="text-gray-500">Select skills that your circle needs:</p>

            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search for skills..."
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
                        selectedItems={circleData.selectedSkills}
                        onToggle={handleSkillToggle}
                    />
                ) : (
                    <ItemGrid
                        items={visibleSkills}
                        selectedItems={circleData.selectedSkills}
                        onToggle={handleSkillToggle}
                        isCause={false}
                    />
                )}

                {visibleSkills.length === 0 && (
                    <div className="col-span-3 py-8 text-center text-gray-500">
                        No skills found matching &quot;{skillSearch}&quot;
                    </div>
                )}
            </ScrollArea>

            <div className="flex flex-wrap">
                {circleData.selectedSkills.map((skill) => (
                    <SelectedItemBadge key={skill.handle} item={skill} onRemove={handleSkillToggle} />
                ))}
            </div>

            {skillsError && <p className="text-sm text-red-500">{skillsError}</p>}

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
