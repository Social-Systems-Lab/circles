"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label"; // Import Label
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, Controller, Control, FieldValues } from "react-hook-form";
import { saveAbout } from "@/app/circles/[handle]/settings/about/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DynamicField,
    DynamicTextField,
    DynamicTextareaField,
    DynamicImageField,
    DynamicSwitchField,
    DynamicLocationField,
} from "@/components/forms/dynamic-field";
import { getUserPrivateAction } from "@/components/modules/home/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import the new component

interface AboutSettingsFormProps {
    circle: Circle;
}

export function AboutSettingsForm({ circle }: AboutSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const [, setUser] = useAtom(userAtom);
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            name: circle.name || "",
            handle: circle.handle || "",
            description: circle.description || "",
            content: circle.content || "",
            mission: circle.mission || "",
            picture: undefined as any, // Keep picture for now
            // cover: undefined as any, // Remove cover
            images:
                circle.images?.map(
                    (media): ImageItem => ({
                        id: media.fileInfo.url, // Use URL as ID for existing
                        preview: media.fileInfo.url,
                        existingMediaUrl: media.fileInfo.url,
                    }),
                ) || [], // Initialize images state
            isPublic: circle.isPublic !== false, // Default to true if not set
            location: circle.location || {},
        },
    });

    const onSubmit = async (data: {
        _id: any;
        name?: string;
        handle?: string;
        description?: string;
        content?: string;
        mission?: string;
        picture?: any;
        // cover?: any; // Remove cover
        images?: ImageItem[]; // Add images
        isPublic?: boolean;
        location?: any;
    }) => {
        setIsSubmitting(true);
        try {
            // TODO: Update saveAbout action to handle the 'images' array correctly
            // For now, pass the data as is. The action needs modification.
            const result = await saveAbout(data as any); // Cast for now, needs action update
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Circle profile updated successfully",
                });
                // fetch new user data
                let userData = await getUserPrivateAction();
                setUser(userData);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update circle profile",
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
                        <CardTitle>Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Controller
                            name="name"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextField
                                    field={{ name: "name", type: "text", label: "Name", required: true }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="handle"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextField
                                    field={{
                                        name: "handle",
                                        type: "text",
                                        label: "Handle",
                                        placeholder: "handle",
                                        description: {
                                            circle: "Choose a unique handle that will identify the circle on the platform.",
                                            user: "Choose a unique handle that will identify you on the platform.",
                                        },
                                        required: true,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="description"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "description",
                                        type: "textarea",
                                        label: "Description",
                                        placeholder: "Description",
                                        description: {
                                            circle: "Describe the circle in a few words.",
                                            user: "Describe yourself in a few words.",
                                        },
                                        maxLength: 200,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="mission"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "mission",
                                        type: "textarea",
                                        label: { user: "Your Mission", circle: "Mission" },
                                        placeholder: "Description",
                                        description: {
                                            circle: "Define the circle's purpose and the change it wants to see in the world.",
                                            user: "Define your purpose and the change you want to see in the world.",
                                        },
                                        maxLength: 500,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="content"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicTextareaField
                                    field={{
                                        name: "content",
                                        type: "textarea",
                                        label: "Content",
                                        placeholder: "Detailed information about your circle",
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        <Controller
                            name="isPublic"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicSwitchField
                                    field={{
                                        name: "isPublic",
                                        type: "switch",
                                        label: "Public",
                                        description: {
                                            circle: "When set to public, users can follow the circle without requiring approval from admins.",
                                            user: "When set to public people can follow you without requiring your approval.",
                                        },
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
                        <CardTitle>Images</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Controller
                            name="picture"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicImageField
                                    field={{
                                        name: "picture",
                                        type: "image",
                                        label: "Picture",
                                        description: {
                                            circle: "Add a picture to represent the circle.",
                                            user: "Add a profile picture.",
                                        },
                                        imagePreviewWidth: 120,
                                        imagePreviewHeight: 120,
                                    }}
                                    formField={field}
                                    control={form.control as unknown as Control}
                                />
                            )}
                        />

                        {/* Replace Cover Image Field with MultiImageUploader */}
                        <Controller
                            name="images"
                            control={form.control as unknown as Control<FieldValues>}
                            render={({ field }) => (
                                <div>
                                    <Label>Images</Label>
                                    <p className="pb-2 text-[0.8rem] text-muted-foreground">
                                        Add images to showcase and represent your circle. Drag to reorder.
                                    </p>
                                    <MultiImageUploader
                                        initialImages={circle.images || []} // Pass original images
                                        onChange={field.onChange} // Let the uploader manage state and report changes
                                        enableReordering={true}
                                        maxImages={10} // Example limit
                                        previewMode="compact"
                                    />
                                </div>
                            )}
                        />
                        {/* End of MultiImageUploader */}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Location</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Controller
                            name="location"
                            control={form.control as unknown as Control}
                            render={({ field }) => (
                                <DynamicLocationField
                                    field={{
                                        name: "location",
                                        type: "location",
                                        label: "Location",
                                        description: {
                                            circle: "Specify the location of the circle.",
                                            user: "Specify your location. Your location will be shared with other users.",
                                        },
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

                <Controller
                    name="_id"
                    control={form.control as unknown as Control}
                    render={({ field }) => (
                        <DynamicField
                            field={{ name: "_id", type: "hidden", label: "ID" }}
                            formField={field}
                            control={form.control as unknown as Control}
                        />
                    )}
                />
            </form>
        </Form>
    );
}
