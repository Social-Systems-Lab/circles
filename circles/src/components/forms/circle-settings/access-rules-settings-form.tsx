"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control } from "react-hook-form";
import { saveAccessRules } from "@/app/circles/[handle]/settings/access-rules/actions";
import { DynamicAccessRulesField } from "@/components/forms/dynamic-field";

interface AccessRulesSettingsFormProps {
    circle: Circle;
}

export function AccessRulesSettingsForm({ circle }: AccessRulesSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            accessRules: circle.accessRules || {},
            userGroups: circle.userGroups || [],
            enabledModules: circle.enabledModules || [],
        },
    });

    const onSubmit = async (data: {
        _id: any;
        accessRules: Record<string, Record<string, string[]>>;
        userGroups: any[];
        enabledModules: string[];
    }) => {
        setIsSubmitting(true);
        try {
            const result = await saveAccessRules({
                _id: data._id,
                accessRules: data.accessRules,
            });

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

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted space-y-6">
                <Controller
                    name="accessRules"
                    control={form.control}
                    render={({ field }) => (
                        <DynamicAccessRulesField
                            field={{
                                name: "accessRules",
                                type: "access-rules",
                                label: "Access Rules",
                            }}
                            formField={field}
                            control={form.control as unknown as Control}
                        />
                    )}
                />

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
