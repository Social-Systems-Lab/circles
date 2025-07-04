"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react"; // Added useCallback, useMemo
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card"; // Added Card imports
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Goal, Location, UserPrivate, ProposalDisplay } from "@/models/models"; // Added UserPrivate, ProposalDisplay
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin, CalendarIcon } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter, useSearchParams } from "next/navigation"; // Import useSearchParams
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from "date-fns"; // Added parseISO, isValid
import { cn } from "@/lib/utils"; // Added cn for conditional classes
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { createGoalAction, updateGoalAction } from "@/app/circles/[handle]/goals/actions";
import { createGoalFromProposalAction } from "@/app/circles/[handle]/proposals/actions";
import CircleSelector from "@/components/global-create/circle-selector"; // Added CircleSelector
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added CreatableItemDetail

// Form schema for creating/editing a goal
const goalFormSchema = z.object({
    // Renamed schema
    title: z.string().min(1, { message: "Goal title is required" }), // Updated message
    description: z.string().min(1, { message: "Description is required" }),
    images: z.array(z.any()).optional(),
    location: z.any().optional(),
    targetDate: z.date().optional(), // Added targetDate
});

type GoalFormValues = Omit<z.infer<typeof goalFormSchema>, "images" | "location" | "targetDate"> & {
    // Renamed type, added targetDate
    images?: (File | Media)[];
    location?: Location;
    targetDate?: Date; // Added targetDate
};

interface GoalFormProps {
    user: UserPrivate;
    itemDetail: CreatableItemDetail;
    goal?: Goal;
    goalId?: string;
    onFormSubmitSuccess?: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    onCancel?: () => void;
    proposal?: ProposalDisplay; // Keep for prefilling from proposal
    initialSelectedCircleId?: string; // Added: To guide CircleSelector
    circle?: Circle; // Added for editing context
    // initialData is effectively replaced by proposal prop for prefilling logic
}

export const GoalForm: React.FC<GoalFormProps> = ({
    user,
    itemDetail,
    goal,
    goalId,
    onFormSubmitSuccess,
    onCancel,
    proposal, // Received from parent dialog
    initialSelectedCircleId: initialCircleIdFromProps, // Renamed for clarity
    circle: circleProp, // Added for editing
}) => {
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(goal?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isEditing = !!goal;

    const targetDateFromQuery = searchParams.get("targetDate");
    let prefilledDate: Date | undefined = undefined;
    if (!isEditing && targetDateFromQuery) {
        const parsedDate = parseISO(targetDateFromQuery);
        if (isValid(parsedDate)) {
            prefilledDate = parsedDate;
        }
    }

    // Determine initial data for the form, prioritizing proposal if available
    const initialFormData = React.useMemo(() => {
        if (proposal) {
            return {
                title: proposal.name,
                description: `${proposal.background || ""}\n\nDecision: ${proposal.decisionText || ""}`.trim(),
                // Images and location are not typically prefilled from proposal for a new goal
            };
        }
        return {
            title: goal?.title || "",
            description: goal?.description || "",
            images: goal?.images || [],
            location: goal?.location,
            targetDate: prefilledDate ?? (goal?.targetDate ? new Date(goal.targetDate) : undefined),
        };
    }, [proposal, goal, prefilledDate]);

    const form = useForm<GoalFormValues>({
        resolver: zodResolver(goalFormSchema),
        defaultValues: initialFormData,
    });

    // Determine the initial circle ID to pass to CircleSelector
    const derivedInitialSelectedCircleId = useMemo(() => {
        if (initialCircleIdFromProps) {
            return initialCircleIdFromProps;
        }
        if (proposal && proposal.circle) {
            return proposal.circle._id;
        }
        if (isEditing && goal && goal.circleId) {
            // Assuming goal object might have circleId when editing
            return goal.circleId;
        }
        return undefined;
    }, [initialCircleIdFromProps, proposal, goal, isEditing]);

    useEffect(() => {
        if (goal?.location) {
            setLocation(goal.location);
        }
    }, [goal?.location]);

    useEffect(() => {
        if (isEditing && circleProp) {
            setSelectedCircle(circleProp);
        }
    }, [isEditing, circleProp, setSelectedCircle]);

    useEffect(() => {
        if (proposal && proposal.circle && !selectedCircle) {
            setSelectedCircle(proposal.circle as Circle);
        }
    }, [proposal, selectedCircle]);

    // Callback for CircleSelector
    const handleCircleSelected = useCallback(
        (circle: Circle | null) => {
            setSelectedCircle(circle);
            form.reset({
                // Reset form fields that might depend on the circle
                ...form.getValues(), // keep existing values
                // Potentially reset other fields if they are circle-dependent
            });
        },
        [form, setSelectedCircle],
    );

    const handleImageChange = (items: ImageItem[]) => {
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) return item.file;
                if (item.existingMediaUrl) {
                    return goal?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: GoalFormValues) => {
        if (!selectedCircle || !selectedCircle.handle) {
            toast({ title: "Error", description: "Please select a circle.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        console.log(
            "[GoalForm] handleSubmit called. isEditing:",
            isEditing,
            "goalId:",
            goalId,
            "circle:",
            selectedCircle.handle,
        );

        const formData = new FormData();
        formData.append("title", values.title);
        formData.append("description", values.description);

        if (location) {
            formData.append("location", JSON.stringify(location));
        }

        if (values.targetDate) {
            formData.append("targetDate", values.targetDate.toISOString());
        }

        // If creating from a proposal, add proposalId to the form data
        if (proposal?._id && !isEditing) {
            // Check proposal._id directly
            formData.append("proposalId", proposal._id.toString());
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
            let result: { success: boolean; message?: string; goalId?: string };
            if (isEditing && goalId) {
                console.log(
                    `[GoalForm] Calling updateGoalAction with goalId: ${goalId} in circle ${selectedCircle.handle}`,
                );
                result = await updateGoalAction(selectedCircle.handle, goalId, formData);
            } else if (proposal?._id) {
                // Check proposal._id for creation from proposal
                console.log(
                    `[GoalForm] Calling createGoalFromProposalAction with proposalId: ${proposal._id} in circle ${selectedCircle.handle}`,
                );
                result = await createGoalFromProposalAction(selectedCircle.handle, formData);
            } else {
                console.log(`[GoalForm] Calling createGoalAction in circle ${selectedCircle.handle}`);
                result = await createGoalAction(selectedCircle.handle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Goal Updated" : "Goal Submitted",
                    description:
                        result.message || (isEditing ? "Goal successfully updated." : "Goal successfully submitted."),
                });

                if (onFormSubmitSuccess) {
                    onFormSubmitSuccess({ id: result.goalId, circleHandle: selectedCircle.handle }); // Pass circleHandle
                } else {
                    const navigateToId = isEditing ? goalId : result.goalId;
                    if (navigateToId && selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/goals/${navigateToId}`);
                    } else if (selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/goals`);
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
            console.error("Error submitting goal form:", error);
            toast({
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive",
            });
            setIsSubmitting(false);
        }
    };

    // CircleSelector is shown if not editing and no proposal with an embedded circle that would pre-select it.
    // Or, more simply, always show if itemDetail is present, and let CircleSelector handle its own visibility/state.
    // The form itself depends on `selectedCircle`.

    return (
        <>
            <Card className="formatted mx-auto w-full">
                <CardHeader className="p-6 pb-0">
                    <h3 className="mb-2 text-2xl font-semibold leading-none tracking-tight">
                        {isEditing
                            ? "Edit Goal"
                            : proposal
                              ? `Create Goal from Proposal: ${proposal.name}`
                              : "Create New Goal"}
                    </h3>
                    {/* CircleSelector moved into this section */}
                    {itemDetail &&
                        !isEditing &&
                        !(proposal && proposal.circle) && ( // Show selector if creating new and not pre-selected by proposal
                            <div className="pb-4 pt-2">
                                <CircleSelector
                                    itemType={itemDetail}
                                    onCircleSelected={handleCircleSelected}
                                    initialSelectedCircleId={derivedInitialSelectedCircleId}
                                />
                            </div>
                        )}
                </CardHeader>
                {selectedCircle ? (
                    <CardContent className="p-6 pt-0">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0 md:space-y-0">
                                {/* Adjusted y-spacing for grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
                                    {/* Grid container */}
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:py-4">
                                                <FormLabel>Goal Title</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g., Organize team meeting"
                                                        {...field}
                                                        disabled={isSubmitting}
                                                    />
                                                </FormControl>
                                                <FormDescription>A short, clear title for the goal.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="targetDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col py-3 md:py-4">
                                                <FormLabel>Target Date (Optional)</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "w-full pl-3 text-left font-normal md:w-[240px]", // Full width on mobile
                                                                    !field.value && "text-muted-foreground",
                                                                )}
                                                                disabled={isSubmitting}
                                                            >
                                                                {field.value ? (
                                                                    format(field.value, "PPP")
                                                                ) : (
                                                                    <span>Pick a date</span>
                                                                )}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            disabled={(date: Date) =>
                                                                date < new Date("1900-01-01") || isSubmitting
                                                            }
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormDescription>
                                                    Set an optional target completion date for this goal.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>{" "}
                                {/* End grid container for first row */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            {/* Spans 2 columns on md+ */}
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Provide details about the goal, goals, and any relevant context..."
                                                    className="min-h-[150px] md:min-h-[200px]" // Adjusted height
                                                    {...field}
                                                    disabled={isSubmitting}
                                                />
                                            </FormControl>
                                            <FormDescription>Explain the goal in detail.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="images"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            {/* Spans 2 columns on md+ */}
                                            <FormLabel>Attach Images (Optional)</FormLabel>
                                            <FormControl>
                                                <MultiImageUploader
                                                    initialImages={goal?.images || []}
                                                    onChange={handleImageChange}
                                                    maxImages={5}
                                                    previewMode="compact"
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Upload images related to the goal (max 5 files, 5MB each).
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
                                                            router.push(`/circles/${selectedCircle.handle}/goals`);
                                                        }
                                                        // No onCancel to call here in this branch
                                                    }}
                                                    disabled={isSubmitting}
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        <Button type="submit" disabled={isSubmitting || !selectedCircle}>
                                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {isEditing ? "Update Goal" : "Create Goal"}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                ) : (
                    // Show this message if no circle is selected (primarily for create mode)
                    !isEditing && ( // Only show if not editing
                        <CardContent className="p-6 pt-0">
                            <div className="pb-4 pt-4 text-center text-muted-foreground">
                                {itemDetail ? "Please select a circle above to create the goal in." : "Loading form..."}
                            </div>
                        </CardContent>
                    )
                )}
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
        </>
    );
};
