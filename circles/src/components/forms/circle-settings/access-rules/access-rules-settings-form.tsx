"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { saveAccessRules } from "@/app/circles/[handle]/settings/access-rules/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { features } from "@/lib/data/constants";

interface AccessRulesSettingsFormProps {
    circle: Circle;
}

export function AccessRulesSettingsForm({ circle }: AccessRulesSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<string>("general");

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            accessRules: circle.accessRules || {},
        },
    });

    const accessRules = form.watch("accessRules");

    const handleCheckboxChange = (module: string, feature: string, userGroup: string, checked: boolean) => {
        const currentRules = { ...accessRules };

        if (!currentRules[module]) {
            currentRules[module] = {};
        }

        if (!currentRules[module][feature]) {
            currentRules[module][feature] = [];
        }

        const userGroups = currentRules[module][feature] || [];

        if (checked) {
            if (!userGroups.includes(userGroup)) {
                currentRules[module][feature] = [...userGroups, userGroup];
            }
        } else {
            currentRules[module][feature] = userGroups.filter((group) => group !== userGroup);
        }

        form.setValue("accessRules", currentRules);
    };

    const onSubmit = async (data: { _id: any; accessRules: Record<string, Record<string, string[]>> }) => {
        setIsSubmitting(true);
        try {
            const result = await saveAccessRules(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Access rules updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update access rules",
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

    // Get all available modules
    const modules = Object.keys(features);

    // Get all user groups
    const userGroups = circle.userGroups || [];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                        {modules.map((module) => (
                            <TabsTrigger key={module} value={module} className="capitalize">
                                {module}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {modules.map((module) => (
                        <TabsContent key={module} value={module} className="space-y-4">
                            <div className="grid gap-4">
                                {Object.entries(features[module as keyof typeof features] || {}).map(
                                    ([featureKey, feature]) => (
                                        <Card key={featureKey}>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-lg">{feature.name}</CardTitle>
                                                <CardDescription>{feature.description}</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                                                    {userGroups.map((group) => (
                                                        <div key={group.handle} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`${module}-${featureKey}-${group.handle}`}
                                                                checked={
                                                                    accessRules[module]?.[featureKey]?.includes(
                                                                        group.handle,
                                                                    ) || false
                                                                }
                                                                onCheckedChange={(checked) =>
                                                                    handleCheckboxChange(
                                                                        module,
                                                                        featureKey,
                                                                        group.handle,
                                                                        checked === true,
                                                                    )
                                                                }
                                                            />
                                                            <label
                                                                htmlFor={`${module}-${featureKey}-${group.handle}`}
                                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                            >
                                                                {group.name}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ),
                                )}
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
