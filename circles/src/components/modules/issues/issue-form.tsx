"use client";

import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Issue, Location, UserPrivate } from "@/models/models"; // Added UserPrivate
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { createIssueAction, updateIssueAction } from "@/app/circles/[handle]/issues/actions";
import CircleSelector from "@/components/global-create/circle-selector"; // Added CircleSelector
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added CreatableItemDetail

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
    user: UserPrivate;
    itemDetail: CreatableItemDetail;
    issue?: Issue;
    issueId?: string;
    onFormSubmitSuccess?: (issueId?: string) => void;
    onCancel?: () => void;
    // circle and circleHandle removed
}

export const IssueForm: React.FC<IssueFormProps> = ({
    user,
    itemDetail,
    issue,
    issueId,
    onFormSubmitSuccess,
    onCancel,
}) => {
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
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

    // Effect to set selectedCircle if editing an existing issue
    useEffect(() => {
        if (isEditing && issue && issue.circleId && user.memberships) {
            const owningCircle = user.memberships.find((m) => m.circleId === issue.circleId)?.circle;
            if (owningCircle) {
                setSelectedCircle(owningCircle);
            }
        }
    }, [isEditing, issue, user]);

    useEffect(() => {
        if (issue?.location) {
            setLocation(issue.location);
        }
    }, [issue?.location]);

    const handleCircleSelected = useCallback(
        (circle: Circle | null) => {
            setSelectedCircle(circle);
            form.reset({
                ...form.getValues(),
            });
        },
        [form, setSelectedCircle],
    );

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
        if (!selectedCircle || !selectedCircle.handle) {
            toast({ title: "Error", description: "Please select a circle.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        console.log(
            "[IssueForm] handleSubmit called. isEditing:",
            isEditing,
            "issueId:",
            issueId,
            "circle:",
            selectedCircle.handle,
        );

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
                console.log(
                    `[IssueForm] Calling updateIssueAction with issueId: ${issueId} in circle ${selectedCircle.handle}`,
                );
                result = await updateIssueAction(selectedCircle.handle, issueId, formData);
            } else {
                console.log(`[IssueForm] Calling createIssueAction in circle ${selectedCircle.handle}`);
                result = await createIssueAction(selectedCircle.handle, formData);
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
                    if (navigateToId && selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/issues/${navigateToId}`);
                    } else if (selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/issues`);
                    }
                    // router.refresh();
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
        <div className="formatted mx-auto w-full">
            {" "}
            {/* Outer div's padding removed */}
            <div className="w-full">
                {" "}
                {/* Replaced Card with div */}
                <div className="p-6">
                    {" "}
                    {/* Replaced CardHeader with div and padding */}
                    <h3 className="mb-2 text-2xl font-semibold leading-none tracking-tight">
                        {isEditing ? "Edit Issue" : "Submit New Issue"}
                    </h3>{" "}
                    {/* Replaced CardTitle */}
                    {!isEditing &&
                        itemDetail && ( // Show CircleSelector only when creating new
                            <div className="pb-4 pt-2">
                                <CircleSelector itemType={itemDetail} onCircleSelected={handleCircleSelected} />
                            </div>
                        )}
                    {selectedCircle && !isEditing && (
                        <p className="text-sm text-muted-foreground">
                            {" "}
                            {/* Replaced CardDescription */}
                            {`Describe the issue you want to report in '${selectedCircle.name || selectedCircle.handle}'.`}
                        </p>
                    )}
                    {isEditing && (
                        <p className="text-sm text-muted-foreground">
                            {" "}
                            {/* Replaced CardDescription */}
                            Update the issue details below.
                            {selectedCircle && ` In '${selectedCircle.name || selectedCircle.handle}'.`}
                        </p>
                    )}
                </div>
                {selectedCircle || isEditing ? ( // Show form if a circle is selected OR if editing
                    <div className="p-6 pt-0">
                        {" "}
                        {/* Replaced CardContent with div and padding */}
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0 md:space-y-0">
                                {" "}
                                {/* Adjusted y-spacing */}
                                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
                                    {" "}
                                    {/* Grid container */}
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:col-span-1 md:py-4">
                                                {" "}
                                                {/* Title in first column */}
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
                                    {/* Empty div for spacing or other elements if needed in the second column */}
                                    <div className="hidden md:col-span-1 md:block"></div>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            {" "}
                                            {/* Description spans two columns */}
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Provide details about the issue, where it is, and why it needs attention..."
                                                    className="min-h-[150px] md:min-h-[200px]"
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
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            {" "}
                                            {/* Images span two columns */}
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
                                        {typeof onCancel === "function" && ( // Explicit check for function
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={onCancel}
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                        {!onCancel &&
                                            !isEditing && ( // Show navigation cancel if no onCancel and not editing
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        if (selectedCircle && selectedCircle.handle) {
                                                            router.push(`/circles/${selectedCircle.handle}/issues`);
                                                        }
                                                        // No onCancel to call here in this branch
                                                    }}
                                                    disabled={isSubmitting}
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting || (!isEditing && !selectedCircle)}
                                        >
                                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {isEditing ? "Update Issue" : "Submit Issue"}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </Form>
                    </div>
                ) : (
                    !isEditing && ( // Show this message only when creating new and no circle selected
                        <div className="p-6 pt-0">
                            {" "}
                            {/* Replaced CardContent with div and padding */}
                            <div className="pb-4 pt-4 text-center text-muted-foreground">
                                Please select a circle above to create the issue in.
                            </div>
                        </div>
                    )
                )}
            </div>{" "}
            {/* End Replaced Card */}
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
