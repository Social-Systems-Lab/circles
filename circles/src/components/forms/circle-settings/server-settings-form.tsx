"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { saveServerSettings } from "@/app/circles/[handle]/settings/server-settings/actions";

interface ServerSettingsFormProps {
    circle: Circle;
    serverSettings?: {
        name?: string;
        description?: string;
        url?: string;
        registryUrl?: string;
        jwtSecret?: string;
        openaiKey?: string;
        mapboxKey?: string;
    };
}

export function ServerSettingsForm({ circle, serverSettings }: ServerSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        defaultValues: {
            name: serverSettings?.name || "",
            description: serverSettings?.description || "",
            url: serverSettings?.url || "",
            registryUrl: serverSettings?.registryUrl || "",
            jwtSecret: serverSettings?.jwtSecret || "",
            openaiKey: serverSettings?.openaiKey || "",
            mapboxKey: serverSettings?.mapboxKey || "",
        },
    });

    const onSubmit = async (data: {
        name?: string;
        description?: string;
        url?: string;
        registryUrl?: string;
        jwtSecret?: string;
        openaiKey?: string;
        mapboxKey?: string;
    }) => {
        setIsSubmitting(true);
        try {
            const result = await saveServerSettings(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Server settings updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update server settings",
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
                        <CardTitle>Server Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Server Name</label>
                            <Input {...form.register("name")} placeholder="Server name" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description</label>
                            <Input {...form.register("description")} placeholder="Server description" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Server URL</label>
                            <Input {...form.register("url")} placeholder="https://example.com" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Registry URL</label>
                            <Input {...form.register("registryUrl")} placeholder="https://registry.example.com" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>API Keys</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">JWT Secret</label>
                            <Input {...form.register("jwtSecret")} type="password" placeholder="JWT secret key" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">OpenAI API Key</label>
                            <Input {...form.register("openaiKey")} type="password" placeholder="OpenAI API key" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Mapbox API Key</label>
                            <Input {...form.register("mapboxKey")} type="password" placeholder="Mapbox API key" />
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
