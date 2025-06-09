"use client";

import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, Media, Task, Location, GoalDisplay, UserPrivate } from "@/models/models"; // Added UserPrivate
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter, useSearchParams } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { createTaskAction, updateTaskAction } from "@/app/circles/[handle]/tasks/actions";
import CircleSelector from "@/components/global-create/circle-selector"; // Added CircleSelector
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added CreatableItemDetail
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions"; // Corrected import for fetching goals

// Form schema for creating/editing a task
const taskFormSchema = z.object({
    title: z.string().min(1, { message: "Task title is required" }),
    description: z.string().min(1, { message: "Description is required" }),
    images: z.array(z.any()).optional(),
    location: z.any().optional(),
    goalId: z.string().optional().nullable(), // Allow null or undefined
});

type TaskFormValues = Omit<z.infer<typeof taskFormSchema>, "images" | "location"> & {
    images?: (File | Media)[];
    location?: Location;
    goalId?: string | null; // Allow null
};

interface TaskFormProps {
    user: UserPrivate; // Added user
    itemDetail: CreatableItemDetail; // Added itemDetail
    task?: Task;
    taskId?: string;
    initialSelectedCircleId?: string; // Added initialSelectedCircleId
    circle?: Circle; // Added for editing context
    // goals and goalsModuleEnabled will be fetched/determined internally
    onFormSubmitSuccess?: (data: { id?: string; circleHandle?: string }) => void; // Updated to include circleHandle
    onCancel?: () => void;
    // circle and circleHandle removed
}

export const TaskForm: React.FC<TaskFormProps> = ({
    user,
    itemDetail,
    task,
    taskId,
    initialSelectedCircleId, // Added initialSelectedCircleId
    circle: circleProp, // Added for editing
    onFormSubmitSuccess,
    onCancel,
}) => {
    const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(task?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const [goals, setGoals] = useState<GoalDisplay[]>([]);
    const [isLoadingGoals, setIsLoadingGoals] = useState(false);
    const [goalsModuleEnabled, setGoalsModuleEnabled] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isEditing = !!task;
    const preselectedGoalId = searchParams.get("goalId");

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskFormSchema),
        defaultValues: {
            title: task?.title || "",
            description: task?.description || "",
            images: task?.images || [],
            location: task?.location,
            goalId: task?.goalId || preselectedGoalId || null,
        },
    });

    // Callback for CircleSelector
    const handleCircleSelected = useCallback(
        (circle: Circle | null) => {
            setSelectedCircle(circle);
            // Reset goals when circle changes
            setGoals([]);
            form.reset({
                // Reset form fields that might depend on the circle, like goalId
                ...form.getValues(), // keep existing values
                goalId: null, // reset goalId
            });
        },
        [form, setSelectedCircle, setGoals],
    );

    useEffect(() => {
        if (task?.location) {
            setLocation(task.location);
        }
        // If editing, set the initial selectedCircle from the task's circle
        // This assumes task object has circle information or we can derive it.
        // For now, if editing, CircleSelector will handle initial selection based on user's circles.
        if (isEditing && circleProp) {
            setSelectedCircle(circleProp);
        }
    }, [task?.location, isEditing, circleProp, setSelectedCircle]);

    useEffect(() => {
        if (selectedCircle?.handle) {
            const isGoalsModuleEnabled = selectedCircle.enabledModules?.includes("goals") || false;
            setGoalsModuleEnabled(isGoalsModuleEnabled);
            if (isGoalsModuleEnabled) {
                setIsLoadingGoals(true);
                getGoalsAction(selectedCircle.handle) // Corrected function call
                    .then((result) => {
                        // result type should now be inferred correctly
                        if (result.goals) {
                            // Assuming result directly contains goals array or is the GetGoalsActionResult
                            setGoals(result.goals);
                        } else {
                            setGoals([]);
                            // Optionally toast an error if fetching goals failed
                        }
                    })
                    .catch(() => setGoals([]))
                    .finally(() => setIsLoadingGoals(false));
            } else {
                setGoals([]);
            }
        } else {
            setGoalsModuleEnabled(false);
            setGoals([]);
        }
    }, [selectedCircle]);

    const handleImageChange = (items: ImageItem[]) => {
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) return item.file;
                if (item.existingMediaUrl) {
                    return task?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: TaskFormValues) => {
        if (!selectedCircle || !selectedCircle.handle) {
            toast({ title: "Error", description: "Please select a circle.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        console.log(
            "[TaskForm] handleSubmit called. isEditing:",
            isEditing,
            "taskId:",
            taskId,
            "circle:",
            selectedCircle.handle,
        );

        const formData = new FormData();
        formData.append("title", values.title);
        formData.append("description", values.description);

        if (location) {
            formData.append("location", JSON.stringify(location));
        }

        // Add goalId if present and not null/empty/none
        if (values.goalId && values.goalId !== "none") {
            formData.append("goalId", values.goalId);
        } else {
            // Explicitly handle unsetting the goal
            formData.append("goalId", ""); // Send empty string to indicate removal
        }

        if (values.images) {
            values.images.forEach((imgOrFile) => {
                if (imgOrFile instanceof File) {
                    formData.append("images", imgOrFile);
                } else if (isEditing && imgOrFile?.fileInfo?.url) {
                    // Ensure it's a valid Media object before stringifying
                    formData.append("images", JSON.stringify(imgOrFile));
                }
            });
        }

        try {
            let result: { success: boolean; message?: string; taskId?: string };
            if (isEditing && taskId) {
                console.log(
                    `[TaskForm] Calling updateTaskAction with taskId: ${taskId} in circle: ${selectedCircle.handle}`,
                );
                result = await updateTaskAction(selectedCircle.handle, taskId, formData);
            } else {
                console.log(`[TaskForm] Calling createTaskAction in circle: ${selectedCircle.handle}`);
                result = await createTaskAction(selectedCircle.handle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Task Updated" : "Task Submitted",
                    description:
                        result.message || (isEditing ? "Task successfully updated." : "Task successfully submitted."),
                });

                if (onFormSubmitSuccess) {
                    onFormSubmitSuccess({ id: result.taskId, circleHandle: selectedCircle.handle }); // Pass circleHandle
                } else {
                    const navigateToId = isEditing ? taskId : result.taskId;
                    if (navigateToId && selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/tasks/${navigateToId}`);
                    } else if (selectedCircle.handle) {
                        router.push(`/circles/${selectedCircle.handle}/tasks`);
                    }
                    router.refresh();
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
        // Outer div's padding removed, dialog will handle it. Max-width might also be dialog's concern.
        <div className="formatted mx-auto w-full">
            <div className="w-full">
                {" "}
                {/* Replaced Card with div */}
                <div className="p-6 pb-0">
                    {" "}
                    {/* Replaced CardHeader with div and padding */}
                    <h3 className="mb-2 text-2xl font-semibold leading-none tracking-tight">
                        {isEditing ? "Edit Task" : "Create New Task"}
                    </h3>{" "}
                    {/* Replaced CardTitle */}
                    {/* CircleSelector moved into this section */}
                    {!isEditing && ( // Only show selector if creating new
                        <div className="pb-4 pt-2">
                            {" "}
                            {/* Added padding for selector */}
                            <CircleSelector
                                itemType={itemDetail}
                                onCircleSelected={handleCircleSelected}
                                initialSelectedCircleId={initialSelectedCircleId}
                            />
                        </div>
                    )}
                </div>
                {selectedCircle ? (
                    <div className="p-6 pt-0">
                        {" "}
                        {/* Replaced CardContent with div and padding */}
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0 md:space-y-0">
                                {" "}
                                {/* Adjusted y-spacing for grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
                                    {" "}
                                    {/* Grid container */}
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:py-4">
                                                {" "}
                                                {/* Added padding */}
                                                <FormLabel>Task Title</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g., Organize team meeting"
                                                        {...field}
                                                        disabled={isSubmitting}
                                                    />
                                                </FormControl>
                                                <FormDescription>A short, clear title for the task.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* Goal Selection Dropdown - Conditionally Rendered */}
                                    {goalsModuleEnabled && (
                                        <FormField
                                            control={form.control}
                                            name="goalId"
                                            render={({ field }) => (
                                                <FormItem className="py-3 md:py-4">
                                                    {" "}
                                                    {/* Added padding */}
                                                    <FormLabel>Assign to Goal (Optional)</FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value ?? "none"}
                                                        disabled={isSubmitting || isLoadingGoals || goals.length === 0}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue
                                                                    placeholder={
                                                                        isLoadingGoals
                                                                            ? "Loading goals..."
                                                                            : goals.length === 0
                                                                              ? "No goals available"
                                                                              : "Select a goal"
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- None --</SelectItem>
                                                            {goals.map((goal) => (
                                                                <SelectItem key={goal._id} value={goal._id}>
                                                                    {goal.title}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormDescription>
                                                        Link this task to an existing goal in this circle.
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>{" "}
                                {/* End grid container for first row */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            {" "}
                                            {/* Spans 2 columns on md+ */}
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Provide details about the task, goals, and any relevant context..."
                                                    className="min-h-[150px] md:min-h-[200px]" // Adjusted height
                                                    {...field}
                                                    disabled={isSubmitting}
                                                />
                                            </FormControl>
                                            <FormDescription>Explain the task in detail.</FormDescription>
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
                                            {/* Spans 2 columns on md+ */}
                                            <FormLabel>Attach Images (Optional)</FormLabel>
                                            <FormControl>
                                                <MultiImageUploader
                                                    initialImages={task?.images || []}
                                                    onChange={handleImageChange}
                                                    maxImages={5}
                                                    previewMode="compact"
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Upload images related to the task (max 5 files, 5MB each).
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
                                        {onCancel && ( // Always show onCancel if provided (dialog context)
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={onCancel}
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                        <Button type="submit" disabled={isSubmitting || !selectedCircle}>
                                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {isEditing ? "Update Task" : "Create Task"}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </Form>
                    </div>
                ) : (
                    // Show this message if no circle is selected (primarily for create mode)
                    !isEditing && (
                        <div className="p-6 pt-0">
                            {" "}
                            {/* Replaced CardContent with div and padding */}
                            <div className="pb-4 pt-4 text-center text-muted-foreground">
                                Please select a circle above to create the task in.
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
                            form.setValue("location", newLocation, {
                                shouldValidate: true,
                            });
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
