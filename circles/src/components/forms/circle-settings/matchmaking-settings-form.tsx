"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control } from "react-hook-form";
import { saveMatchmaking } from "@/app/circles/[handle]/settings/matchmaking/actions";
import { DynamicField } from "@/components/forms/dynamic-field";

interface MatchmakingSettingsFormProps {
    circle: Circle;
}

export function MatchmakingSettingsForm({ circle }: MatchmakingSettingsFormProps): React.ReactElement {
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

    const onSubmit = async (data: { _id: any; causes?: string[]; skills?: string[]; location?: any }) => {
        setIsSubmitting(true);
        try {
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Causes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Select the causes that your circle is focused on. This helps connect your circle with others
                            who share similar interests.
                        </p>
                        <Controller
                            name="causes"
                            control={form.control}
                            render={({ field }) => (
                                <DynamicField
                                    field={{
                                        name: "causes",
                                        type: "causes",
                                        label: "Causes",
                                        placeholder: "Search causes...",
                                        description: "Select the causes that your circle is focused on.",
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
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
                        <Controller
                            name="skills"
                            control={form.control}
                            render={({ field }) => (
                                <DynamicField
                                    field={{
                                        name: "skills",
                                        type: "skills",
                                        label: "Skills",
                                        placeholder: "Search skills...",
                                        description: "Select the skills that are relevant to your circle.",
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                    </CardContent>
                </Card>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
