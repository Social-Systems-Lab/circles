"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Issue, Location } from "@/models/models"; // Use Issue types
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react"; // Added MapPin
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Import Issue Server Actions
import { createIssueAction, updateIssueAction } from "@/app/circles/[handle]/issues/actions";

// Form schema for creating/editing an issue
const issueFormSchema = z.object({
    title: z.string().min(1, { message: "Issue title is required" }),
    description: z.string().min(1, { message: "Description is required" }),
    images: z.array(z.any()).optional(), // react-hook-form handles FileList/Media[]
    location: z.any().optional(), // Location object or undefined
});

type IssueFormValues = Omit<z.infer<typeof issueFormSchema>, "images" | "location"> & {
    images?: (File | Media)[]; // Allow both File (new uploads) and Media (existing)
    location?: Location;
};

interface IssueFormProps {
    circle: Circle;
    issue?: Issue; // If provided, we're editing an existing issue
    circleHandle: string;
    issueId?: string; // Pass issueId if editing
    onFormSubmitSuccess?: (issueId?: string) => void; // For dialog usage
    onCancel?: () => void; // For dialog usage
}

export const IssueForm: React.FC<IssueFormProps> = ({
    circle,
    issue,
    circleHandle,
    issueId,
    onFormSubmitSuccess,
    onCancel,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(issue?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!issue;

    const form = useForm<IssueFormValues>({
        resolver: zodResolver(issueFormSchema),
        defaultValues: {
            title: issue?.title || "",
            description: issue?.description || "",
            images: issue?.images || [],
            location: issue?.location,
        },
    });

    useEffect(() => {
        if (issue?.location) {
            setLocation(issue.location);
        }
    }, [issue?.location]);

    const handleImageChange = (items: ImageItem[]) => {
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) return item.file;
                if (item.existingMediaUrl) {
                    return issue?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: IssueFormValues) => {
        setIsSubmitting(true);
        console.log("[IssueForm] handleSubmit called. isEditing:", isEditing, "issueId:", issueId); // Debug log

        const formData = new FormData();
        formData.append("title", values.title);
        formData.append("description", values.description);

        if (location) {
            formData.append("location", JSON.stringify(location));
        }

        if (values.images) {
            values.images.forEach((imgOrFile) => {
                if (imgOrFile instanceof File) {
                    formData.append("images", imgOrFile);
                } else if (isEditing) {
                    formData.append("images", JSON.stringify(imgOrFile));
                }
            });
        }

        try {
            let result: { success: boolean; message?: string; issueId?: string };
            if (isEditing && issueId) {
                console.log(`[IssueForm] Calling updateIssueAction with issueId: ${issueId}`); // Debug log
                result = await updateIssueAction(circleHandle, issueId, formData);
            } else {
                console.log("[IssueForm] Calling createIssueAction"); // Debug log
                result = await createIssueAction(circleHandle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Issue Updated" : "Issue Submitted",
                    description:
                        result.message || (isEditing ? "Issue successfully updated." : "Issue successfully submitted."),
                });

                if (onFormSubmitSuccess) {
                    onFormSubmitSuccess(result.issueId);
                } else {
                    const navigateToId = isEditing ? issueId : result.issueId;
                    if (navigateToId) {
                        router.push(`/circles/${circleHandle}/issues/${navigateToId}`);
                    } else {
                        router.push(`/circles/${circleHandle}/issues`);
                    }
                    // router.refresh(); // IssueForm didn't have this
                }
            } else {
                toast({
                    title: "Submission Error",
                    description: result.message || "An error occurred. Please try again.",
                    variant: "destructive",
                });
                setIsSubmitting(false);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive",
            });
            setIsSubmitting(false);
        }
    };

    return (
        <div className="formatted mx-auto max-w-[700px]">
            {/* TODO: Add stage timeline if needed for editing */}
            {/* {isEditing && issue.stage && ( <IssueStageTimeline currentStage={issue.stage} /> )} */}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{isEditing ? "Edit Issue" : "Submit New Issue"}</CardTitle>
                    <CardDescription>
                        {isEditing ? "Update the issue details below." : "Describe the issue you want to report."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Issue Title</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="e.g., Coffee machine broken"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>A short, clear title for the issue.</FormDescription>
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
                                            <Textarea
                                                placeholder="Provide details about the issue, where it is, and why it needs attention..."
                                                className="min-h-[200px]"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>Explain the issue in detail.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="images"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Attach Images (Optional)</FormLabel>
                                        <FormControl>
                                            <MultiImageUploader
                                                initialImages={issue?.images || []}
                                                onChange={handleImageChange}
                                                maxImages={5}
                                                previewMode="compact"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Upload images related to the issue (max 5 files, 5MB each).
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {location && (
                                <div className="mt-4 flex flex-row items-center justify-start rounded-lg border bg-muted/40 p-3">
                                    <MapPin className={`mr-2 h-4 w-4 text-primary`} />
                                    <span className="text-sm text-muted-foreground">
                                        {getFullLocationName(location)}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-4">
                                <div className="flex space-x-1">
                                    <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="rounded-full"
                                                    onClick={() => setIsLocationDialogOpen(true)}
                                                    disabled={isSubmitting}
                                                >
                                                    <MapPinIcon className="h-5 w-5 text-gray-500" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Add Location</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>

                                <div className="flex space-x-4">
                                    {onCancel ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={onCancel}
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </Button>
                                    ) : !isEditing ? ( // Only show router-based cancel if not editing and not in dialog
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                                // When !isEditing, issue is undefined, so path is just to issues list for the circle
                                                router.push(`/circles/${circleHandle}/issues`)
                                            }
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </Button>
                                    ) : null}
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {isEditing ? "Update Issue" : "Submit Issue"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                <DialogContent
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Select Location</DialogTitle>
                    </DialogHeader>
                    <LocationPicker
                        value={location!}
                        onChange={(newLocation) => {
                            setLocation(newLocation);
                            form.setValue("location", newLocation, { shouldValidate: true });
                        }}
                    />
                    <div className="mt-4 flex justify-end">
                        <Button variant="secondary" onClick={() => setIsLocationDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="default" onClick={() => setIsLocationDialogOpen(false)} className="ml-2">
                            Set Location
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
