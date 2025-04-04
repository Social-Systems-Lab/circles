"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle, UserGroup } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control } from "react-hook-form";
import { saveUserGroups } from "@/app/circles/[handle]/settings/user-groups/actions";
import { handleSchema } from "@/models/models";
import { DynamicTableField } from "@/components/forms/dynamic-field";

interface UserGroupsSettingsFormProps {
    circle: Circle;
}

export function UserGroupsSettingsForm({ circle }: UserGroupsSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            userGroups: circle.userGroups || [],
        },
    });

    const onSubmit = async (data: { _id: any; userGroups: UserGroup[] }) => {
        setIsSubmitting(true);
        try {
            // Validate handles
            const invalidHandles = data.userGroups.filter((group) => {
                try {
                    handleSchema.parse(group.handle);
                    return false;
                } catch (error) {
                    return true;
                }
            });

            if (invalidHandles.length > 0) {
                toast({
                    title: "Error",
                    description: "Some handles are invalid. Handles can only contain letters, numbers, and hyphens.",
                    variant: "destructive",
                });
                setIsSubmitting(false);
                return;
            }

            const result = await saveUserGroups(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "User groups updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update user groups",
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
                    name="userGroups"
                    control={form.control}
                    render={({ field }) => (
                        <DynamicTableField
                            field={{
                                name: "userGroups",
                                type: "table",
                                label: "User Groups",
                                itemSchema: {
                                    id: "user-groups-table",
                                    title: "User Group",
                                    description: "Configure user groups for your circle",
                                    button: { text: "Save" },
                                    fields: [
                                        {
                                            name: "name",
                                            type: "text",
                                            label: "Name",
                                            placeholder: "Group name",
                                            showInHeader: true,
                                            required: true,
                                        },
                                        {
                                            name: "handle",
                                            type: "text",
                                            label: "Handle",
                                            placeholder: "group-handle",
                                            showInHeader: true,
                                            required: true,
                                        },
                                        {
                                            name: "title",
                                            type: "text",
                                            label: "Title",
                                            placeholder: "Member title",
                                            showInHeader: true,
                                        },
                                        {
                                            name: "accessLevel",
                                            type: "number",
                                            label: "Access Level",
                                            placeholder: "100",
                                            showInHeader: true,
                                            required: true,
                                        },
                                        {
                                            name: "description",
                                            type: "text",
                                            label: "Description",
                                            placeholder: "Group description",
                                        },
                                        {
                                            name: "readOnly",
                                            type: "hidden",
                                            label: "Read Only",
                                        },
                                    ],
                                },
                                defaultValue: {
                                    name: "",
                                    handle: "",
                                    title: "",
                                    description: "",
                                    accessLevel: 400,
                                    readOnly: false,
                                },
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
