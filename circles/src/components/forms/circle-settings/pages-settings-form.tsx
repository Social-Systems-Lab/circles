"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Circle, ModuleInfo } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { savePages } from "@/app/circles/[handle]/settings/pages/actions";
import { features, modules } from "@/lib/data/constants";

interface PagesSettingsFormProps {
    circle: Circle;
}

export function PagesSettingsForm({ circle }: PagesSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Get all available modules from features
    const availableModules: ModuleInfo[] = modules;

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            enabledModules: circle.enabledModules || ["general", "settings"],
        },
    });

    const enabledModules = form.watch("enabledModules");

    const handleToggle = (moduleHandle: string, enabled: boolean) => {
        let updatedModules = [...enabledModules];

        if (enabled && !updatedModules.includes(moduleHandle)) {
            updatedModules.push(moduleHandle);
        } else if (!enabled) {
            updatedModules = updatedModules.filter((m) => m !== moduleHandle);
        }

        form.setValue("enabledModules", updatedModules);
    };

    const onSubmit = async (data: { _id: any; enabledModules: string[] }) => {
        setIsSubmitting(true);
        try {
            // Make sure general and settings are always included
            if (!data.enabledModules.includes("general")) {
                data.enabledModules.push("general");
            }
            if (!data.enabledModules.includes("settings")) {
                data.enabledModules.push("settings");
            }

            const result = await savePages(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Modules settings updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update modules settings",
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
                <div className="space-y-4">
                    {availableModules.map((module) => (
                        <Card key={module.handle}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">{module.name}</CardTitle>
                                    <Switch
                                        checked={enabledModules.includes(module.handle)}
                                        onCheckedChange={(checked) => handleToggle(module.handle, checked)}
                                        disabled={module.readOnly}
                                        aria-readonly={module.readOnly}
                                    />
                                </div>
                                <CardDescription>{module.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
