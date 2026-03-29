"use client";

import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card"; // Added Card imports
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, Media, Task, Location, GoalDisplay, EventDisplay, UserPrivate, TaskPriority } from "@/models/models"; // Added UserPrivate
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin, CalendarIcon } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { useRouter, useSearchParams } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { getFullLocationName } from "@/lib/utils";
import { createTaskAction, updateTaskAction } from "@/app/circles/[handle]/tasks/actions";
import CircleSelector from "@/components/global-create/circle-selector"; // Added CircleSelector
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Added CreatableItemDetail
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions"; // Corrected import for fetching goals
import { getEventsAction } from "@/app/circles/[handle]/events/actions";

const taskPriorityOptions: { value: TaskPriority; label: string; description: string }[] = [
    { value: "low", label: "Low", description: "Nice to have" },
    { value: "medium", label: "Medium", description: "Useful to have" },
    { value: "high", label: "High", description: "Need to have" },
    { value: "critical", label: "Critical", description: "Critical to have" },
];

// Form schema for creating/editing a task
const taskFormSchema = z.object({
    title: z.string().min(1, { message: "Task title is required" }),
    description: z.string().optional(),
    images: z.array(z.any()).optional(),
    location: z.any().optional(),
    targetDate: z.date().optional(),
    goalId: z.string().optional().nullable(), // Allow null or undefined
    eventId: z.string().optional().nullable(), // Allow null or undefined
    priority: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
});

type TaskFormValues = Omit<z.infer<typeof taskFormSchema>, "images" | "location" | "targetDate"> & {
    images?: (File | Media)[];
    location?: Location;
    targetDate?: Date;
    goalId?: string | null; // Allow null
    eventId?: string | null;
    priority?: TaskPriority | null;
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
    const [events, setEvents] = useState<EventDisplay[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [eventsModuleEnabled, setEventsModuleEnabled] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isEditing = !!task;
    const preselectedGoalId = searchParams.get("goalId");
    const preselectedEventId = searchParams.get("eventId");
    const targetDateFromQuery = searchParams.get("targetDate");
    let prefilledDate: Date | undefined = undefined;
    if (!isEditing && targetDateFromQuery) {
        const parsedDate = parseISO(targetDateFromQuery);
        if (isValid(parsedDate)) {
            prefilledDate = parsedDate;
        }
    }

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskFormSchema),
        defaultValues: {
            title: task?.title || "",
            description: task?.description || "",
            images: task?.images || [],
            location: task?.location,
            targetDate: prefilledDate ?? (task?.targetDate ? new Date(task.targetDate) : undefined),
            goalId: task?.goalId || preselectedGoalId || null,
            eventId: (task as any)?.eventId || preselectedEventId || null,
            priority: task?.priority || null,
        },
    });

    // Callback for CircleSelector
    const handleCircleSelected = useCallback(
        (circle: Circle | null) => {
            const isDifferentCircle = Boolean(selectedCircle?._id && circle?._id && selectedCircle._id !== circle._id);
            setSelectedCircle(circle);
            setGoals([]);
            setEvents([]);
            if (isDifferentCircle) {
                form.reset({
                    ...form.getValues(),
                    goalId: null,
                    eventId: null,
                });
            }
        },
        [form, selectedCircle?._id],
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

    useEffect(() => {
        if (selectedCircle?.handle) {
            const isEventsModuleEnabled = selectedCircle.enabledModules?.includes("events") || false;
            setEventsModuleEnabled(isEventsModuleEnabled);
            if (isEventsModuleEnabled) {
                setIsLoadingEvents(true);
                getEventsAction(selectedCircle.handle)
                    .then((result) => {
                        if ((result as any)?.events) {
                            setEvents((result as any).events);
                        } else {
                            setEvents([]);
                        }
                    })
                    .catch(() => setEvents([]))
                    .finally(() => setIsLoadingEvents(false));
            } else {
                setEvents([]);
            }
        } else {
            setEventsModuleEnabled(false);
            setEvents([]);
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
        formData.append("description", values.description ?? "");

        if (location) {
            formData.append("location", JSON.stringify(location));
        }

        if (values.targetDate) {
            formData.append("targetDate", values.targetDate.toISOString());
        }

        // Add goalId if present and not null/empty/none
        if (values.goalId && values.goalId !== "none") {
            formData.append("goalId", values.goalId);
        } else {
            // Explicitly handle unsetting the goal
            formData.append("goalId", ""); // Send empty string to indicate removal
        }

        // Add eventId if present and not null/empty/none
        if (values.eventId && values.eventId !== "none") {
            formData.append("eventId", values.eventId);
        } else {
            // Explicitly handle unsetting the event
            formData.append("eventId", ""); // Send empty string to indicate removal
        }

        if (values.priority) {
            formData.append("priority", values.priority);
        } else {
            formData.append("priority", "");
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
        <>
            <Card className="formatted mx-auto w-full">
                <CardHeader className="p-6 pb-0">
                    <h3 className="mb-2 text-2xl font-semibold leading-none tracking-tight">
                        {isEditing ? "Edit Task" : "Create New Task"}
                    </h3>
                    {!isEditing && (
                        <div className="pb-4 pt-2">
                            <p className="mb-2 text-sm font-medium text-foreground">Create in</p>
                            <CircleSelector
                                itemType={itemDetail}
                                onCircleSelected={handleCircleSelected}
                                initialSelectedCircleId={initialSelectedCircleId}
                            />
                        </div>
                    )}
                </CardHeader>
                {selectedCircle ? (
                    <CardContent className="p-6 pt-0">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-0 md:space-y-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:py-4">
                                                <FormLabel>Title</FormLabel>
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
                                </div>
                                <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
                                    <FormField
                                        control={form.control}
                                        name="targetDate"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:py-4">
                                                <FormLabel>Target Date (Optional)</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "w-full pl-3 text-left font-normal md:w-[240px]",
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
                                                    Set an optional target completion date for this task.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="priority"
                                        render={({ field }) => (
                                            <FormItem className="py-3 md:py-4">
                                                <FormLabel>Priority (Optional)</FormLabel>
                                                <Select
                                                    onValueChange={(value) =>
                                                        field.onChange(value === "none" ? null : value)
                                                    }
                                                    value={field.value ?? "none"}
                                                    disabled={isSubmitting}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a priority" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="none">None</SelectItem>
                                                        {taskPriorityOptions.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label} - {option.description}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormDescription>
                                                    Leave unset unless this task needs a visible priority badge.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Add details if helpful"
                                                    className="min-h-[150px] md:min-h-[200px]"
                                                    {...field}
                                                    disabled={isSubmitting}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="py-2 md:col-span-2">
                                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                        Optional Details
                                    </h4>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="images"
                                    render={({ field }) => (
                                        <FormItem className="py-3 md:col-span-2 md:py-4">
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
                                <div className="py-3 md:col-span-2 md:py-4">
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                Location (Optional)
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Add a place if this task needs one.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-start md:w-auto"
                                            onClick={() => setIsLocationDialogOpen(true)}
                                            disabled={isSubmitting}
                                        >
                                            <MapPinIcon className="mr-2 h-4 w-4" />
                                            {location ? "Change Location" : "Add Location"}
                                        </Button>
                                        {location && (
                                            <div className="flex flex-row items-center justify-start rounded-lg border bg-muted/40 p-3">
                                                <MapPin className="mr-2 h-4 w-4 text-primary" />
                                                <span className="text-sm text-muted-foreground">
                                                    {getFullLocationName(location)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {(goalsModuleEnabled || eventsModuleEnabled) && (
                                    <div className="py-2 md:col-span-2">
                                        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                            Optional Linking
                                        </h4>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 gap-0 md:col-span-2 md:grid-cols-2 md:gap-x-6">
                                    {goalsModuleEnabled && (
                                        <FormField
                                            control={form.control}
                                            name="goalId"
                                            render={({ field }) => (
                                                <FormItem className="py-3 md:py-4">
                                                    <FormLabel>Goal (Optional)</FormLabel>
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
                                    {eventsModuleEnabled && (
                                        <FormField
                                            control={form.control}
                                            name="eventId"
                                            render={({ field }) => (
                                                <FormItem className="py-3 md:py-4">
                                                    <FormLabel>Event (Optional)</FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value ?? "none"}
                                                        disabled={isSubmitting || isLoadingEvents || events.length === 0}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue
                                                                    placeholder={
                                                                        isLoadingEvents
                                                                            ? "Loading events..."
                                                                            : events.length === 0
                                                                              ? "No events available"
                                                                              : "Select an event"
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- None --</SelectItem>
                                                            {events.map((event) => (
                                                                <SelectItem
                                                                    key={(event as any)._id}
                                                                    value={(event as any)._id}
                                                                >
                                                                    {event.title}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormDescription>
                                                        Link this task to an existing event in this circle.
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                                <div className="flex items-center justify-between pt-4">
                                    <div />
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
                    </CardContent>
                ) : (
                    // Show this message if no circle is selected (primarily for create mode)
                    !isEditing && (
                        <CardContent className="p-6 pt-0">
                            <div className="pb-4 pt-4 text-center text-muted-foreground">
                                Please select a circle above to create the task in.
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
        </>
    );
};
