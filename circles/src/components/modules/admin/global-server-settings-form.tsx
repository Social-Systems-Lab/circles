"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea component exists
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { ServerSettings } from "@/models/models";
import { GlobalServerSettingsFormData, globalServerSettingsValidationSchema } from "./global-server-settings-schema";
import { saveGlobalServerSettings } from "./actions";

interface GlobalServerSettingsFormProps {
    serverSettings: ServerSettings; // Use the full ServerSettings type for initial data
    maxWidth?: string; // Optional prop for styling
}

export function GlobalServerSettingsForm({
    serverSettings,
    maxWidth = "100%",
}: GlobalServerSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<GlobalServerSettingsFormData>({
        resolver: zodResolver(globalServerSettingsValidationSchema),
        defaultValues: {
            name: serverSettings?.name || "",
            description: serverSettings?.description || "",
            url: serverSettings?.url || "",
            registryUrl: serverSettings?.registryUrl || "",
            jwtSecret: serverSettings?.jwtSecret || "",
            openaiKey: serverSettings?.openaiKey || "",
            mapboxKey: serverSettings?.mapboxKey || "",
            defaultCircleId: serverSettings?.defaultCircleId || "",
            did: serverSettings?.did || "", // Include DID, though it's not directly editable
        },
    });

    const onSubmit = async (data: GlobalServerSettingsFormData) => {
        setIsSubmitting(true);
        try {
            // Ensure DID from initial settings is included if not present in form data (it shouldn't be editable)
            const dataToSave = { ...data, did: serverSettings?.did || data.did };

            const result = await saveGlobalServerSettings(dataToSave);
            if (result.success) {
                toast({
                    title: "Success",
                    description: result.message || "Global server settings updated successfully",
                });
                router.refresh(); // Refresh page to reflect changes
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update global server settings",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" style={{ maxWidth }}>
                {/* Server Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Server Information</CardTitle>
                        <CardDescription>Basic details about this Circles instance.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Server Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Circles Instance Name" {...field} />
                                    </FormControl>
                                    <FormDescription>The public name of this server.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="A brief description of this server" {...field} />
                                    </FormControl>
                                    <FormDescription>Optional description.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="url"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Server URL</FormLabel>
                                    <FormControl>
                                        <Input placeholder="https://your-circles-domain.com" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        The main public URL where this server is accessible.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="registryUrl"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Circles Registry URL</FormLabel>
                                    <FormControl>
                                        <Input placeholder="https://circles-registry.com (optional)" {...field} />
                                    </FormControl>
                                    <FormDescription>URL of the central registry service, if used.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {/* Display DID read-only */}
                        {serverSettings?.did && (
                            <FormItem>
                                <FormLabel>Server DID</FormLabel>
                                <FormControl>
                                    <Input readOnly value={serverSettings.did} className="bg-muted" />
                                </FormControl>
                                <FormDescription>
                                    The unique Decentralized Identifier for this server (read-only).
                                </FormDescription>
                            </FormItem>
                        )}
                    </CardContent>
                </Card>

                {/* API Keys Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>API Keys & Secrets</CardTitle>
                        <CardDescription>Confidential keys for authentication and external services.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="jwtSecret"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>JWT Secret</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Keep this secret" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Secret key for signing user authentication tokens.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="openaiKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>OpenAI API Key</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="sk-..." {...field} />
                                    </FormControl>
                                    <FormDescription>API key for using OpenAI features.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="mapboxKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mapbox API Key</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="pk.eyJ..." {...field} />
                                    </FormControl>
                                    <FormDescription>API key for using Mapbox map services.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Global Settings"}
                </Button>
            </form>
        </Form>
    );
}
