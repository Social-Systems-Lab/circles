"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Circle, UserGroup } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { saveUserGroups } from "@/app/circles/[handle]/settings/user-groups/actions";
import { PlusCircle, Trash2 } from "lucide-react";
import { handleSchema } from "@/models/models";

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

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "userGroups",
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

    const addNewUserGroup = () => {
        append({
            name: "",
            handle: "",
            title: "",
            description: "",
            accessLevel: 400, // Default access level for new groups
            readOnly: false,
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                    {fields.map((field, index) => {
                        const isReadOnly = form.getValues(`userGroups.${index}.readOnly`);

                        return (
                            <Card key={field.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">
                                            {form.getValues(`userGroups.${index}.name`) || "New User Group"}
                                        </CardTitle>
                                        {!isReadOnly && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Name</label>
                                            <Input
                                                {...form.register(`userGroups.${index}.name`)}
                                                disabled={isReadOnly}
                                                placeholder="Group name"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Handle</label>
                                            <Input
                                                {...form.register(`userGroups.${index}.handle`)}
                                                disabled={isReadOnly}
                                                placeholder="group-handle"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Title</label>
                                            <Input
                                                {...form.register(`userGroups.${index}.title`)}
                                                disabled={isReadOnly}
                                                placeholder="Member title"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Access Level</label>
                                            <Input
                                                type="number"
                                                {...form.register(`userGroups.${index}.accessLevel`, {
                                                    valueAsNumber: true,
                                                })}
                                                disabled={isReadOnly}
                                                placeholder="100"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Description</label>
                                        <Input
                                            {...form.register(`userGroups.${index}.description`)}
                                            disabled={isReadOnly}
                                            placeholder="Group description"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                <Button type="button" variant="outline" onClick={addNewUserGroup} className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add User Group
                </Button>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
