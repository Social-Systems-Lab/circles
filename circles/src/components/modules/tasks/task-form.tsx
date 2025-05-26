"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Circle, Media, Task, Location, GoalDisplay } from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter, useSearchParams } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createTaskAction, updateTaskAction } from "@/app/circles/[handle]/tasks/actions";
// Removed goals action import

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
    circle: Circle;
    task?: Task; // Use Task type here (from DB)
    circleHandle: string;
    taskId?: string;
    goals: GoalDisplay[]; // Receive goals as prop
    goalsModuleEnabled: boolean; // Receive flag as prop
    onFormSubmitSuccess?: (taskId?: string) => void; // For dialog usage
    onCancel?: () => void; // For dialog usage
}

export const TaskForm: React.FC<TaskFormProps> = ({
    circle,
    task,
    circleHandle,
    taskId,
    goals, // Destructure goals prop
    goalsModuleEnabled, // Destructure flag
    onFormSubmitSuccess,
    onCancel,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(task?.location);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    // Removed goals state and loading state
    // const [goals, setGoals] = useState<GoalDisplay[]>([]);
    // const [isLoadingGoals, setIsLoadingGoals] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isEditing = !!task;
    const preselectedGoalId = searchParams.get("goalId");

    // Removed goalsModuleEnabled useMemo, using prop directly

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskFormSchema),
        defaultValues: {
            title: task?.title || "",
            description: task?.description || "",
            images: task?.images || [],
            location: task?.location,
            // Ensure goalId is set correctly: task's goalId > preselected > null
            goalId: task?.goalId || preselectedGoalId || null,
        },
    });

    useEffect(() => {
        if (task?.location) {
            setLocation(task.location);
        }
    }, [task?.location]);

    // Removed useEffect for fetching goals

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
        setIsSubmitting(true);
        console.log("[TaskForm] handleSubmit called. isEditing:", isEditing, "taskId:", taskId);

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
                console.log(`[TaskForm] Calling updateTaskAction with taskId: ${taskId}`);
                result = await updateTaskAction(circleHandle, taskId, formData);
            } else {
                console.log("[TaskForm] Calling createTaskAction");
                result = await createTaskAction(circleHandle, formData);
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Task Updated" : "Task Submitted",
                    description:
                        result.message || (isEditing ? "Task successfully updated." : "Task successfully submitted."),
                });

                if (onFormSubmitSuccess) {
                    onFormSubmitSuccess(result.taskId);
                } else {
                    const navigateToId = isEditing ? taskId : result.taskId;
                    if (navigateToId) {
                        router.push(`/circles/${circleHandle}/tasks/${navigateToId}`);
                    } else {
                        router.push(`/circles/${circleHandle}/tasks`);
                    }
                    router.refresh(); // Refresh data on the target page
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
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{isEditing ? "Edit Task" : "Create New Task"}</CardTitle>
                    <CardDescription>
                        {isEditing ? "Update the task details below." : "Describe the task you want to create."}{" "}
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
                                        <FormItem>
                                            <FormLabel>Assign to Goal (Optional)</FormLabel>
                                            <Select
                                                // Use field.onChange provided by RHF
                                                onValueChange={field.onChange}
                                                // Use field.value which comes from defaultValues
                                                value={field.value ?? "none"} // Handle null/undefined, default to "none" visually
                                                disabled={isSubmitting || goals.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue
                                                            placeholder={
                                                                goals.length === 0
                                                                    ? "No goals available"
                                                                    : "Select a goal"
                                                            }
                                                        />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {/* Add explicit "None" option */}
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

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Provide details about the task, goals, and any relevant context..."
                                                className="min-h-[200px]"
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
                                    <FormItem>
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
                                                // When !isEditing, task is undefined, so path is just to tasks list for the circle
                                                router.push(`/circles/${circleHandle}/tasks`)
                                            }
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </Button>
                                    ) : null}
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {isEditing ? "Update Task" : "Create Task"}
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
