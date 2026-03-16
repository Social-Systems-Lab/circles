"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useForm, Controller, Control } from "react-hook-form";
import { savePresence } from "@/app/circles/[handle]/settings/presence/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicTextareaField, DynamicTagsField } from "@/components/forms/dynamic-field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Check, Search, X } from "lucide-react";
import { getInterestLabel, interestOptions } from "@/lib/data/interests";
import { skillsV2, skillCategoryLabels, SkillCategory } from "@/lib/data/skills-v2";
import { cn } from "@/lib/utils";

interface PresenceSettingsFormProps {
    circle: Circle;
}

const skillNameByHandle = new Map(skillsV2.map((skill) => [skill.handle, skill.name]));
const skillCategoryOrder = Object.keys(skillCategoryLabels) as SkillCategory[];

interface StructuredSkillSelectorProps {
    value: string[] | undefined;
    onChange: (handles: string[]) => void;
}

interface InterestSelectorProps {
    value: string[] | undefined;
    onChange: (interests: string[]) => void;
}

function StructuredSkillSelector({ value, onChange }: StructuredSkillSelectorProps): React.ReactElement {
    const [searchText, setSearchText] = useState("");

    const selectedHandles = useMemo(() => {
        if (!Array.isArray(value)) return [];

        const dedupedHandles: string[] = [];
        const seen = new Set<string>();

        for (const rawHandle of value) {
            if (typeof rawHandle !== "string") continue;
            const normalizedHandle = rawHandle.trim();
            if (!normalizedHandle || seen.has(normalizedHandle)) continue;
            seen.add(normalizedHandle);
            dedupedHandles.push(normalizedHandle);
        }

        return dedupedHandles;
    }, [value]);

    const filteredSkills = useMemo(() => {
        const query = searchText.trim().toLowerCase();

        if (!query) return skillsV2;

        return skillsV2.filter((skill) => {
            const categoryLabel = skillCategoryLabels[skill.category].toLowerCase();
            return (
                skill.name.toLowerCase().includes(query) ||
                skill.description.toLowerCase().includes(query) ||
                categoryLabel.includes(query)
            );
        });
    }, [searchText]);

    const groupedSkills = useMemo(() => {
        const skillsByCategory = new Map<SkillCategory, typeof skillsV2>();
        for (const category of skillCategoryOrder) {
            skillsByCategory.set(category, []);
        }

        for (const skill of filteredSkills) {
            const currentGroup = skillsByCategory.get(skill.category) || [];
            currentGroup.push(skill);
            skillsByCategory.set(skill.category, currentGroup);
        }

        return skillCategoryOrder
            .map((category) => ({
                category,
                label: skillCategoryLabels[category],
                skills: skillsByCategory.get(category) || [],
            }))
            .filter((group) => group.skills.length > 0);
    }, [filteredSkills]);

    const toggleSkill = (handle: string) => {
        if (selectedHandles.includes(handle)) {
            onChange(selectedHandles.filter((existingHandle) => existingHandle !== handle));
            return;
        }
        onChange([...selectedHandles, handle]);
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                    type="text"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search skills..."
                    className="pl-8"
                />
            </div>

            <ScrollArea className="h-[320px] rounded-md border p-3">
                <div className="space-y-4">
                    {groupedSkills.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            No skills found matching &quot;{searchText}&quot;.
                        </p>
                    )}

                    {groupedSkills.map((group) => (
                        <div key={group.category} className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                            </p>
                            <div className="space-y-1">
                                {group.skills.map((skill) => {
                                    const isSelected = selectedHandles.includes(skill.handle);
                                    return (
                                        <button
                                            key={skill.handle}
                                            type="button"
                                            onClick={() => toggleSkill(skill.handle)}
                                            className={cn(
                                                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                                                isSelected
                                                    ? "border-primary bg-primary/5 text-foreground"
                                                    : "hover:bg-muted/40",
                                            )}
                                        >
                                            <span>{skill.name}</span>
                                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Selected skills</p>
                <div className="flex flex-wrap gap-2">
                    {selectedHandles.length > 0 ? (
                        selectedHandles.map((handle) => (
                            <Badge key={handle} variant="secondary" className="flex items-center gap-1">
                                <span>{skillNameByHandle.get(handle) || handle}</span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${skillNameByHandle.get(handle) || handle}`}
                                    onClick={() => toggleSkill(handle)}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">No skills selected yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function InterestSelector({ value, onChange }: InterestSelectorProps): React.ReactElement {
    const selectedInterests = useMemo<string[]>(() => {
        if (!Array.isArray(value)) return [];

        const selectedSet = new Set<string>(
            value
                .filter((interest): interest is string => typeof interest === "string")
                .map((interest) => interest.trim())
                .filter(Boolean),
        );

        return interestOptions
            .map((option) => option.value)
            .filter((interest) => selectedSet.has(interest));
    }, [value]);

    const toggleInterest = (interest: string) => {
        if (selectedInterests.includes(interest)) {
            onChange(selectedInterests.filter((existingInterest) => existingInterest !== interest));
            return;
        }

        onChange([...selectedInterests, interest]);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Topics / interests</p>
                <p className="text-sm text-muted-foreground">{selectedInterests.length} selected</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {interestOptions.map((interest) => {
                    const isSelected = selectedInterests.includes(interest.value);

                    return (
                        <button
                            key={interest.value}
                            type="button"
                            onClick={() => toggleInterest(interest.value)}
                            className={cn(
                                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                isSelected
                                    ? "border-[#6f7a34] bg-[#6f7a34] text-white"
                                    : "hover:bg-muted/40",
                            )}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span>{interest.label}</span>
                                {isSelected && <Check className="h-4 w-4" />}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Selected interests</p>
                <div className="flex flex-wrap gap-2">
                    {selectedInterests.length > 0 ? (
                        selectedInterests.map((interest) => (
                            <Badge key={interest} variant="secondary" className="flex items-center gap-1">
                                <span>{getInterestLabel(interest)}</span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${getInterestLabel(interest)}`}
                                    onClick={() => toggleInterest(interest)}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground">No interests selected yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PresenceSettingsForm({ circle }: PresenceSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isUser = circle.circleType === "user";
    const useStructuredNeedsSelector = circle.circleType !== "user";

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            handle: circle.handle,
            offers: circle.offers || {},
            engagements: {
                ...(circle.engagements || {}),
                interests: circle.interests?.length ? circle.interests : circle.engagements?.interests || [],
            },
            needs: circle.needs || {},
        },
    });

    const onSubmit = async (data: any) => {
        setIsSubmitting(true);
        try {
            const result = await savePresence(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: isUser
                        ? "Skills & interests updated successfully"
                        : "Offers and needs updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update settings",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{isUser ? "My offers & skills" : "Opportunities"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Controller
                            name="offers.text"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "offers.text",
                                        type: "textarea",
                                        label: isUser ? "What I can offer right now" : "Why get involved",
                                        maxLength: 600,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                        {isUser && (
                            <Controller
                                name="offers.skills"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Skills</p>
                                        <StructuredSkillSelector
                                            value={field.value as string[] | undefined}
                                            onChange={field.onChange}
                                        />
                                    </div>
                                )}
                            />
                        )}
                    </CardContent>
                </Card>

                {isUser && (
                    <Card>
                        <CardHeader>
                            <CardTitle>What I want to engage in</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Controller
                                name="engagements.text"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <DynamicTextareaField
                                        field={{
                                            name: "engagements.text",
                                            type: "textarea",
                                            label: "Types of projects or roles I'm seeking",
                                            maxLength: 600,
                                        }}
                                        formField={field}
                                        control={form.control as unknown as Control}
                                    />
                                )}
                            />
                            <Controller
                                name="engagements.interests"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <InterestSelector
                                        value={field.value as string[] | undefined}
                                        onChange={field.onChange}
                                    />
                                )}
                            />
                        </CardContent>
                    </Card>
                )}

                {!isUser && (
                    <Card>
                        <CardHeader>
                            <CardTitle>What we need help with</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Controller
                                name="needs.text"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    <DynamicTextareaField
                                        field={{
                                            name: "needs.text",
                                            type: "textarea",
                                            label: "Current needs",
                                            maxLength: 600,
                                        }}
                                        formField={field}
                                        control={form.control as unknown as Control}
                                    />
                                )}
                            />
                            <Controller
                                name="needs.tags"
                                control={form.control as unknown as Control}
                                render={({ field }) => (
                                    useStructuredNeedsSelector ? (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium">Needs</p>
                                            <StructuredSkillSelector
                                                value={field.value as string[] | undefined}
                                                onChange={field.onChange}
                                            />
                                        </div>
                                    ) : (
                                        <DynamicTagsField
                                            field={{
                                                name: "needs.tags",
                                                type: "tags",
                                                label: "Needs",
                                            }}
                                            formField={field}
                                            control={form.control as unknown as Control}
                                        />
                                    )
                                )}
                            />
                        </CardContent>
                    </Card>
                )}

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
