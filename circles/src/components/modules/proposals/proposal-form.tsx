"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Proposal, ProposalStage } from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Info } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
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
});

type ProposalFormValues = Omit<z.infer<typeof proposalFormSchema>, "images"> & {
    images?: (File | Media)[]; // Allow both File (new uploads) and Media (existing)
};

interface ProposalFormProps {
    circle: Circle; // Keep circle for handle/ID access if needed, or pass handle directly
    proposal?: Proposal; // If provided, we're editing an existing proposal
    // Remove onSubmit prop
    circleHandle: string; // Pass handle for action call
    proposalId?: string; // Pass proposalId if editing
}

export const ProposalForm: React.FC<ProposalFormProps> = ({ circle, proposal, circleHandle, proposalId }) => {
    // Removed uploadedImages state, MultiImageUploader manages its internal state
    const [isSubmitting, setIsSubmitting] = useState(false);
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
        },
    });

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
                                            Background & Rationale
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

                            <div className="flex justify-end space-x-4">
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
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
};
