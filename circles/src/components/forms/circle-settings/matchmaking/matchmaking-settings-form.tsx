"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { saveMatchmaking } from "@/app/circles/[handle]/settings/matchmaking/actions";
import { Checkbox } from "@/components/ui/checkbox";

interface MatchmakingSettingsFormProps {
    circle: Circle;
    causes: { handle: string; name: string }[];
    skills: { handle: string; name: string }[];
}

export function MatchmakingSettingsForm({ circle, causes, skills }: MatchmakingSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            causes: circle.causes || [],
            skills: circle.skills || [],
            location: circle.location || {},
        },
    });

    const [selectedCauses, setSelectedCauses] = useState<string[]>(circle.causes || []);
    const [selectedSkills, setSelectedSkills] = useState<string[]>(circle.skills || []);

    const onSubmit = async (data: { _id: any; causes?: string[]; skills?: string[]; location?: any }) => {
        setIsSubmitting(true);
        try {
            // Update with selected values
            data.causes = selectedCauses;
            data.skills = selectedSkills;

            const result = await saveMatchmaking(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Matchmaking settings updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update matchmaking settings",
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Causes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Select the causes that your circle is focused on. This helps connect your circle with others
                            who share similar interests.
                        </p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                            {causes.map((cause) => (
                                <div key={cause.handle} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`cause-${cause.handle}`}
                                        checked={selectedCauses.includes(cause.handle)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedCauses([...selectedCauses, cause.handle]);
                                            } else {
                                                setSelectedCauses(selectedCauses.filter((c) => c !== cause.handle));
                                            }
                                        }}
                                    />
                                    <label
                                        htmlFor={`cause-${cause.handle}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {cause.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Skills</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Select the skills that are relevant to your circle. This helps match your circle with
                            members who have the skills you need.
                        </p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                            {skills.map((skill) => (
                                <div key={skill.handle} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`skill-${skill.handle}`}
                                        checked={selectedSkills.includes(skill.handle)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedSkills([...selectedSkills, skill.handle]);
                                            } else {
                                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.handle));
                                            }
                                        }}
                                    />
                                    <label
                                        htmlFor={`skill-${skill.handle}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {skill.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
