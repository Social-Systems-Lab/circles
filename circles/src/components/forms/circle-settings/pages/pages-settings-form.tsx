"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Circle, Page } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { savePages } from "@/app/circles/[handle]/settings/pages/actions";

interface PagesSettingsFormProps {
    circle: Circle;
}

export function PagesSettingsForm({ circle }: PagesSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            pages: circle.pages || [],
        },
    });

    const pages = form.watch("pages");

    const handleToggle = (page: Page, enabled: boolean) => {
        const updatedPages = pages.map((p: Page) => {
            if (p.handle === page.handle) {
                return { ...p, enabled };
            }
            return p;
        });
        form.setValue("pages", updatedPages);
    };

    const onSubmit = async (data: { _id: any; pages: Page[] }) => {
        setIsSubmitting(true);
        try {
            const result = await savePages(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Pages settings updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update pages settings",
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
                <div className="space-y-4">
                    {pages.map((page: Page) => (
                        <Card key={page.handle}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">{page.name}</CardTitle>
                                    <Switch
                                        checked={page.enabled !== false}
                                        onCheckedChange={(checked) => handleToggle(page, checked)}
                                        disabled={page.readOnly}
                                        aria-readonly={page.readOnly}
                                    />
                                </div>
                                <CardDescription>{page.description}</CardDescription>
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
