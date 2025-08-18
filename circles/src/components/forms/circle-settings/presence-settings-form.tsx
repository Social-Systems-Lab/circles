"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control } from "react-hook-form";
import { savePresence } from "@/app/circles/[handle]/settings/presence/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicTextareaField, DynamicTagsField } from "@/components/forms/dynamic-field";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface PresenceSettingsFormProps {
    circle: Circle;
}

export function PresenceSettingsForm({ circle }: PresenceSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            offers: circle.offers || {},
            engagements: circle.engagements || {},
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
                    description: "Presence settings updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update presence settings",
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
                        <CardTitle>My offers & skills</CardTitle>
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
                                        label: "What I can offer right now",
                                        maxLength: 600,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />
                        <Controller
                            name="offers.skills"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTagsField
                                    field={{
                                        name: "offers.skills",
                                        type: "tags",
                                        label: "Skills",
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
                                <DynamicTagsField
                                    field={{
                                        name: "engagements.interests",
                                        type: "tags",
                                        label: "Interests",
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
                        <CardTitle>What I need help with</CardTitle>
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
                    </CardContent>
                </Card>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
