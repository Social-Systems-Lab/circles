"use client";

import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    onFormSubmitSuccess?: (goalId?: string) => void;
    onCancel?: () => void;
    proposal?: ProposalDisplay; // Keep for prefilling from proposal
    preselectedCircle?: Circle; // Keep for pre-selecting circle
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
    preselectedCircle, // Received from parent dialog
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

    // Effect to set selectedCircle if preselectedCircle or proposal.circle is provided
    useEffect(() => {
        if (preselectedCircle) {
            setSelectedCircle(preselectedCircle);
        } else if (proposal && proposal.circle) {
            setSelectedCircle(proposal.circle as Circle);
        }
        // If editing an existing goal, and no preselectedCircle/proposal,
        // CircleSelector will handle showing options.
        // If task.circle was available, we could set it here for editing.
    }, [preselectedCircle, proposal]);

    useEffect(() => {
        if (goal?.location) {
            setLocation(goal.location);
        }
    }, [goal?.location]);

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
                    onFormSubmitSuccess(result.goalId);
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
            toast({
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive",
            });
            setIsSubmitting(false);
        }
    };

    // Determine if CircleSelector should be shown:
    // Not editing, AND no preselectedCircle, AND no proposal with an embedded circle.
    const showCircleSelector = !isEditing && !preselectedCircle && !(proposal && proposal.circle);

    return (
        <div className="formatted mx-auto max-w-[700px] p-4">
            {showCircleSelector && itemDetail && (
                <div className="mb-6">
                    <CircleSelector itemType={itemDetail} onCircleSelected={handleCircleSelected} />
                </div>
            )}

            {selectedCircle || preselectedCircle || (proposal && proposal.circle) ? (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>
                            {isEditing
                                ? "Edit Goal"
                                : proposal
                                  ? `Create Goal from Proposal: ${proposal.name}`
                                  : "Create New Goal"}
                        </CardTitle>
                        <CardDescription>
                            {isEditing ? "Update the goal details below." : "Describe the goal you want to create."}
                            {selectedCircle && ` In '${selectedCircle.name || selectedCircle.handle}'.`}
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
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Provide details about the goal, goals, and any relevant context..."
                                                    className="min-h-[200px]"
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
                                        <FormItem>
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

                                <FormField
                                    control={form.control}
                                    name="targetDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Target Date (Optional)</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-[240px] pl-3 text-left font-normal",
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
                                        ) : !isEditing ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    if (selectedCircle && selectedCircle.handle) {
                                                        router.push(`/circles/${selectedCircle.handle}/goals`);
                                                    } else if (typeof onCancel === "function") {
                                                        onCancel();
                                                    }
                                                }}
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </Button>
                                        ) : null}
                                        <Button type="submit" disabled={isSubmitting || !selectedCircle}>
                                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {isEditing ? "Update Goal" : "Create Goal"}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            ) : !showCircleSelector && !selectedCircle ? (
                <div className="pt-4 text-center text-muted-foreground">Circle information is being determined...</div>
            ) : null}
            {showCircleSelector && !selectedCircle && (
                <div className="pt-4 text-center text-muted-foreground">
                    Please select a circle above to create the goal in.
                </div>
            )}

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
