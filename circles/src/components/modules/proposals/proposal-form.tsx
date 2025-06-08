"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react"; // Added useCallback, useMemo
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Proposal, ProposalStage, Location, UserPrivate } from "@/models/models"; // Added UserPrivate
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Info, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker"; // Added LocationPicker
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; // Added Dialog components
import { getFullLocationName } from "@/lib/utils"; // Added getFullLocationName
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { createProposalAction, updateProposalAction } from "@/app/circles/[handle]/proposals/actions";
import CircleSelector from "@/components/global-create/circle-selector"; // Added CircleSelector
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added CreatableItemDetail

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
    user: UserPrivate;
    itemDetail: CreatableItemDetail;
    proposal?: Proposal;
    proposalId?: string;
    initialSelectedCircleId?: string; // Added for consistency, though primarily for create pages
    onFormSubmitSuccess?: (proposalId?: string) => void;
    onCancel?: () => void;
    // circle and circleHandle removed
}

export const ProposalForm: React.FC<ProposalFormProps> = ({
    user,
    itemDetail,
    proposal,
    proposalId,
    initialSelectedCircleId, // Added
    onFormSubmitSuccess,
    onCancel,
}) => {
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(proposal?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!proposal;

    const form = useForm<ProposalFormValues>({
        resolver: zodResolver(proposalFormSchema),
        defaultValues: {
            name: proposal?.name || "",
            background: proposal?.background || "",
            decisionText: proposal?.decisionText || "",
            images: proposal?.images || [],
            location: proposal?.location,
        },
    });

    useEffect(() => {
        if (isEditing && proposal && proposal.circleId && user?.memberships) {
            // Added user null check for safety
            const owningCircle = user.memberships.find((m) => m.circleId === proposal.circleId)?.circle;
            if (owningCircle) {
                setSelectedCircle(owningCircle);
            }
        }
        // For !isEditing, CircleSelector will handle initial selection if initialSelectedCircleId is provided
        // or pick a default.
    }, [isEditing, proposal, user, initialSelectedCircleId]); // Added initialSelectedCircleId to dependencies

    useEffect(() => {
        if (proposal?.location) {
            setLocation(proposal.location);
        }
    }, [proposal?.location]);

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
                if (item.file) {
                    return item.file;
                } else if (item.existingMediaUrl) {
                    return proposal?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: ProposalFormValues) => {
        if (!selectedCircle || !selectedCircle.handle) {
            toast({ title: "Error", description: "Please select a circle.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);

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
            if (isEditing && proposalId) {
                result = await updateProposalAction(selectedCircle.handle, proposalId, formData);
            } else {
                result = await createProposalAction(selectedCircle.handle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Proposal Updated" : "Proposal Created",
                    description:
                        result.message ||
                        (isEditing ? "Proposal successfully updated." : "Proposal successfully created."),
                });

                // Navigate after success
                if (onFormSubmitSuccess) {
                    onFormSubmitSuccess(result.proposalId);
                } else {
                    const navigateToId = isEditing ? proposalId : result.proposalId;
                    if (navigateToId && selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/proposals/${navigateToId}`);
                        router.refresh();
                    } else if (selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/proposals`);
                        router.refresh();
                    }
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

    // Determine initial circle ID for CircleSelector if creating new
    const derivedInitialSelectedCircleId = useMemo(() => {
        if (!isEditing && initialSelectedCircleId) {
            return initialSelectedCircleId;
        }
        // In edit mode, selectedCircle is set by the useEffect above.
        // For global create, initialSelectedCircleId will be undefined, CircleSelector picks default.
        return undefined;
    }, [isEditing, initialSelectedCircleId]);

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
                        {isEditing ? "Edit Proposal" : "Create New Proposal"}
                    </h3>{" "}
                    {/* Replaced CardTitle */}
                    {!isEditing &&
                        itemDetail && ( // Show CircleSelector only when creating new
                            <div className="pt-2">
                                <CircleSelector
                                    itemType={itemDetail}
                                    onCircleSelected={handleCircleSelected}
                                    initialSelectedCircleId={derivedInitialSelectedCircleId}
                                />
                            </div>
                        )}
                    {selectedCircle && !isEditing && (
                        <p className="text-sm text-muted-foreground">
                            {" "}
                            {/* Replaced CardDescription */}
                            {`Fill in the details for your new proposal in '${selectedCircle.name || selectedCircle.handle}'.`}
                        </p>
                    )}
                    {isEditing && (
                        <p className="text-sm text-muted-foreground">
                            {" "}
                            {/* Replaced CardDescription */}
                            Update your proposal details below.
                            {/* For editing, selectedCircle is derived from proposal.circleId, so this part of description is fine */}
                            {selectedCircle && ` In '${selectedCircle.name || selectedCircle.handle}'.`}
                        </p>
                    )}
                </div>
                {isEditing &&
                    proposal?.stage && ( // Show timeline only when editing, moved below header
                        <div className="p-6 pb-4 pt-0">
                            {" "}
                            {/* Replaced CardContent with div and padding */} {/* Adjust padding if needed */}
                            <div className="mb-6 ml-4 mr-4">
                                {" "}
                                {/* Timeline might need margin adjustments */}
                                <ProposalStageTimeline currentStage={proposal.stage} />
                            </div>
                        </div>
                    )}
                {selectedCircle ? (
                    <div className={`p-6 ${isEditing && proposal?.stage ? "pt-0" : ""}`}>
                        {" "}
                        {/* Replaced CardContent with div and padding */}{" "}
                        {/* Remove CardContent top padding if timeline was shown */}
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0 md:space-y-0">
                                {" "}
                                {/* Adjusted y-spacing */}
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:py-4">
                                            {" "}
                                            {/* Added padding */}
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
                                        <FormItem className="py-3 md:py-4">
                                            {" "}
                                            {/* Added padding */}
                                            <FormLabel className="flex items-center">
                                                Decision Text
                                                <TooltipProvider delayDuration={100}>
                                                    <Tooltip>
                                                        <TooltipTrigger className="ml-1 cursor-help">
                                                            <Info className="h-4 w-4 text-muted-foreground" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            <p className="text-sm">
                                                                Clearly state what you want decided. For example,
                                                                &quot;Work towards building a neighborhood composting
                                                                station by summer&quot; or &quot;Get a water boiler for
                                                                the kitchen&quot; Keep this statement concise and
                                                                explicit.
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
                                        <FormItem className="py-3 md:py-4">
                                            {" "}
                                            {/* Added padding */}
                                            <FormLabel className="flex items-center">
                                                Background
                                                <TooltipProvider delayDuration={100}>
                                                    <Tooltip>
                                                        <TooltipTrigger className="ml-1 cursor-help">
                                                            <Info className="h-4 w-4 text-muted-foreground" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            <p className="text-sm">
                                                                Provide relevant context or history that explains why
                                                                you’re making this proposal. Include any data,
                                                                references, or story so that reviewers and voters
                                                                understand the problem or rationale behind your request.
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
                                        <FormItem className="py-3 md:py-4">
                                            {" "}
                                            {/* Added padding */}
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
                                                Upload relevant images to support the background information (max 5
                                                files, 5MB each).
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
                                        {/* Conditional rendering for Cancel button */}
                                        {typeof onCancel === "function" && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={onCancel} // Directly use onCancel here
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
                                                            router.push(`/circles/${selectedCircle.handle}/proposals`);
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
                                            {" "}
                                            {/* Disable submit if creating and no circle selected */}
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
                    </div>
                ) : (
                    // Message if no circle is selected (primarily for create mode)
                    !isEditing && (
                        <div className="p-6 pt-0">
                            {" "}
                            {/* Replaced CardContent with div and padding */}
                            <div className="pb-4 pt-4 text-center text-muted-foreground">
                                {itemDetail
                                    ? "Please select a circle above to create the proposal in."
                                    : "Loading form..."}
                            </div>
                        </div>
                    )
                )}
            </div>{" "}
            {/* End Replaced Card */}
            {/* Location Dialog */}
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
