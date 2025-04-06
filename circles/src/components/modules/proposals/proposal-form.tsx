"use client";

import React, { useState, useEffect } from "react"; // Added useEffect
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Proposal, ProposalStage, Location } from "@/models/models"; // Added Location
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Info, MapPinIcon, MapPin } from "lucide-react"; // Added MapPinIcon, MapPin
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker"; // Added LocationPicker
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; // Added Dialog components
import { getFullLocationName } from "@/lib/utils"; // Added getFullLocationName
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Import Server Actions
import { createProposalAction, updateProposalAction } from "@/app/circles/[handle]/proposals/actions";

// Form schema for creating/editing a proposal
const proposalFormSchema = z.object({
    name: z.string().min(1, { message: "Proposal name is required" }),
    background: z.string().min(1, { message: "Background information is required" }),
    decisionText: z.string().min(1, { message: "Decision text is required" }),
    images: z.array(z.any()).optional(), // react-hook-form handles FileList/Media[]
    location: z.any().optional(), // Added location field
});

type ProposalFormValues = Omit<z.infer<typeof proposalFormSchema>, "images" | "location"> & {
    images?: (File | Media)[]; // Allow both File (new uploads) and Media (existing)
    location?: Location; // Added location field
};

interface ProposalFormProps {
    circle: Circle; // Keep circle for handle/ID access if needed, or pass handle directly
    proposal?: Proposal; // If provided, we're editing an existing proposal
    // Remove onSubmit prop
    circleHandle: string; // Pass handle for action call
    proposalId?: string; // Pass proposalId if editing
}

export const ProposalForm: React.FC<ProposalFormProps> = ({ circle, proposal, circleHandle, proposalId }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(proposal?.location); // Added location state
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false); // Added dialog state
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!proposal;

    // Initialize form with existing proposal data if editing
    const form = useForm<ProposalFormValues>({
        resolver: zodResolver(proposalFormSchema),
        defaultValues: {
            name: proposal?.name || "",
            background: proposal?.background || "",
            decisionText: proposal?.decisionText || "",
            images: proposal?.images || [], // Pass existing images
            location: proposal?.location, // Initialize location
        },
    });

    // Initialize location state when proposal data is available (for edit mode)
    useEffect(() => {
        if (proposal?.location) {
            setLocation(proposal.location);
        }
    }, [proposal?.location]);

    // Handle image updates from MultiImageUploader
    const handleImageChange = (items: ImageItem[]) => {
        // Map ImageItem[] back to (File | Media)[] for the form state
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) {
                    return item.file; // It's a new File
                } else if (item.existingMediaUrl) {
                    // Find the original Media object from the proposal prop
                    return proposal?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null; // Should not happen if item is valid
            })
            .filter((img): img is File | Media => img !== null); // Filter out any nulls

        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: ProposalFormValues) => {
        setIsSubmitting(true);

        // Construct FormData here
        const formData = new FormData();
        formData.append("name", values.name);
        formData.append("background", values.background);
        formData.append("decisionText", values.decisionText);

        // Append location if selected
        if (location) {
            formData.append("location", JSON.stringify(location));
        }

        // Append images: both new Files and existing Media objects (as JSON strings) for update, only Files for create
        if (values.images) {
            values.images.forEach((imgOrFile) => {
                if (imgOrFile instanceof File) {
                    formData.append("images", imgOrFile);
                } else if (isEditing) {
                    // Only append existing Media identifiers if editing
                    formData.append("images", JSON.stringify(imgOrFile));
                }
            });
        }

        try {
            let result: { success: boolean; message?: string; proposalId?: string };
            // Call the appropriate server action directly
            if (isEditing && proposalId) {
                result = await updateProposalAction(circleHandle, proposalId, formData);
            } else {
                result = await createProposalAction(circleHandle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Proposal Updated" : "Proposal Created",
                    description:
                        result.message ||
                        (isEditing ? "Proposal successfully updated." : "Proposal successfully created."),
                });

                // Navigate after success
                const navigateToId = isEditing ? proposalId : result.proposalId;
                if (navigateToId) {
                    router.push(`/circles/${circleHandle}/proposals/${navigateToId}`);
                    router.refresh(); // Refresh page data
                } else {
                    // Fallback if ID is missing (shouldn't happen in success case)
                    router.push(`/circles/${circleHandle}/proposals`);
                    router.refresh();
                }
            } else {
                toast({
                    title: "Submission Error",
                    description: result.message || "An error occurred. Please try again.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="formatted mx-auto max-w-[700px]">
            {isEditing && proposal.stage && (
                <div className="mb-12 ml-4 mr-4">
                    <ProposalStageTimeline currentStage={proposal.stage} />
                </div>
            )}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{isEditing ? "Edit Proposal" : "Create New Proposal"}</CardTitle>
                    <CardDescription>
                        {isEditing
                            ? "Update your proposal details below."
                            : "Fill in the details for your new proposal."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Proposal Name</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="Enter a clear, descriptive name for your proposal"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            A concise title that clearly communicates the purpose of your proposal.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Decision Text Field */}
                            <FormField
                                control={form.control}
                                name="decisionText"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center">
                                            Decision Text
                                            <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                    <TooltipTrigger className="ml-1 cursor-help">
                                                        <Info className="h-4 w-4 text-muted-foreground" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right" className="max-w-xs">
                                                        <p className="text-sm">
                                                            Clearly state what you want decided. For example, &quot;Work
                                                            towards building a neighborhood composting station by
                                                            summer&quot; or &quot;Get a water boiler for the
                                                            kitchen&quot; Keep this statement concise and explicit.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Clearly state the specific action or decision being proposed."
                                                className="min-h-[100px]" // Shorter than background
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            This is the core statement that participants will vote on.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Background Field */}
                            <FormField
                                control={form.control}
                                name="background"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center">
                                            Background
                                            <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                    <TooltipTrigger className="ml-1 cursor-help">
                                                        <Info className="h-4 w-4 text-muted-foreground" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right" className="max-w-xs">
                                                        <p className="text-sm">
                                                            Provide relevant context or history that explains why you’re
                                                            making this proposal. Include any data, references, or story
                                                            so that reviewers and voters understand the problem or
                                                            rationale behind your request.
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Explain the context, reasons, and supporting details for your proposal..."
                                                className="min-h-[250px]"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Provide the necessary context and justification for your proposal.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Image Uploader Field */}
                            <FormField
                                control={form.control}
                                name="images"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Attach Images (Optional)</FormLabel>
                                        <FormControl>
                                            <MultiImageUploader
                                                // Pass existing Media objects directly from the proposal data
                                                initialImages={proposal?.images || []}
                                                onChange={handleImageChange} // This function accepts ImageItem[] and updates form state
                                                maxImages={5} // Correct prop name
                                                // maxSizeMB is not a prop of MultiImageUploader, remove it
                                                previewMode="compact" // As requested
                                                // disabled prop is not available, remove it
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Upload relevant images to support the background information (max 5 files,
                                            5MB each).
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Display Selected Location */}
                            {location && (
                                <div className="mt-4 flex flex-row items-center justify-start rounded-lg border bg-muted/40 p-3">
                                    <MapPin className={`mr-2 h-4 w-4 text-primary`} />
                                    <span className="text-sm text-muted-foreground">
                                        {getFullLocationName(location)}
                                    </span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between pt-4">
                                {/* Left side: Icons */}
                                <div className="flex space-x-1">
                                    {/* Image Picker Trigger (already part of MultiImageUploader) */}
                                    {/* Location Picker Trigger */}
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
                                    {/* Add other icons here if needed */}
                                </div>

                                {/* Right side: Cancel/Submit */}
                                <div className="flex space-x-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            router.push(
                                                `/circles/${circle.handle}/proposals${proposal?._id ? `/${proposal._id}` : ""}`,
                                            )
                                        }
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {isEditing ? "Updating..." : "Creating..."}
                                            </>
                                        ) : (
                                            <>{isEditing ? "Update Proposal" : "Create Proposal"}</>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {/* Location Dialog */}
            <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Location</DialogTitle>
                    </DialogHeader>
                    <LocationPicker
                        value={location!} // Pass current location
                        onChange={(newLocation) => {
                            setLocation(newLocation); // Update state
                            form.setValue("location", newLocation, { shouldValidate: true }); // Update form value
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
