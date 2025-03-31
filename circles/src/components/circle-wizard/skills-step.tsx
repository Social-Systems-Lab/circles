"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CircleWizardStepProps } from "./circle-wizard";
import { skills } from "@/lib/data/constants";
import { saveSkillsAction } from "./actions";
import { Skill } from "@/models/models";

// Badge component for selected skills
function SelectedSkillBadge({ skill, onRemove }: { skill: Skill; onRemove: (skill: Skill) => void }) {
    return (
        <Badge variant="secondary" className="m-1 cursor-pointer" onClick={() => onRemove(skill)}>
            {skill.name}
            <span className="ml-1">×</span>
        </Badge>
    );
}

// Skill card component
function SkillCard({
    skill,
    isSelected,
    onToggle,
}: {
    skill: Skill;
    isSelected: boolean;
    onToggle: (skill: Skill) => void;
}) {
    return (
        <div
            className={`flex cursor-pointer flex-col items-center rounded-lg border p-3 transition-colors ${
                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"
            }`}
            onClick={() => onToggle(skill)}
        >
            <div className="mb-2 h-12 w-12 overflow-hidden rounded-full">
                <img
                    src={skill.picture?.url || `/images/skills/${skill.handle}.png`}
                    alt={skill.name}
                    className="h-full w-full object-cover"
                />
            </div>
            <h3 className="text-center text-sm font-medium">{skill.name}</h3>
        </div>
    );
}

export default function SkillsStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [skillSearch, setSkillSearch] = useState("");
    const [isPending, startTransition] = useTransition();
    const [skillsError, setSkillsError] = useState("");

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
            // Save the skills
            const skillHandles = circleData.selectedSkills.map((skill) => skill.handle);
            const result = await saveSkillsAction(skillHandles);

            if (result.success) {
                nextStep();
            } else {
                // Handle error
                setSkillsError(result.message || "Failed to save skills");
                console.error(result.message);
            }
        });
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Choose Skills</h2>
            <p className="text-gray-500">Select skills that are relevant to your circle:</p>

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
                <div className="grid grid-cols-2 gap-3 p-1 md:grid-cols-3">
                    {visibleSkills.map((skill) => (
                        <SkillCard
                            key={skill.handle}
                            skill={skill}
                            isSelected={circleData.selectedSkills.some((s) => s.handle === skill.handle)}
                            onToggle={handleSkillToggle}
                        />
                    ))}

                    {visibleSkills.length === 0 && (
                        <div className="col-span-3 py-8 text-center text-gray-500">
                            No skills found matching "{skillSearch}"
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="flex flex-wrap">
                {circleData.selectedSkills.map((skill) => (
                    <SelectedSkillBadge key={skill.handle} skill={skill} onRemove={handleSkillToggle} />
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
