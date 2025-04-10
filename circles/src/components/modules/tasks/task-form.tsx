"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Task, Location } from "@/models/models"; // Use Task types
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Import Task Server Actions
import { createTaskAction, updateTaskAction } from "@/app/circles/[handle]/tasks/actions"; // Updated actions

// Form schema for creating/editing a task
const taskFormSchema = z.object({
    // Renamed schema
    title: z.string().min(1, { message: "Task title is required" }), // Updated message
    description: z.string().min(1, { message: "Description is required" }),
    images: z.array(z.any()).optional(),
    location: z.any().optional(),
});

type TaskFormValues = Omit<z.infer<typeof taskFormSchema>, "images" | "location"> & {
    // Renamed type
    images?: (File | Media)[];
    location?: Location;
};

interface TaskFormProps {
    // Renamed interface
    circle: Circle;
    task?: Task; // Renamed prop, updated type
    circleHandle: string;
    taskId?: string; // Renamed prop
}

export const TaskForm: React.FC<TaskFormProps> = ({ circle, task, circleHandle, taskId }) => {
    // Renamed component, props
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(task?.location); // Use task prop
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!task; // Use task prop

    const form = useForm<TaskFormValues>({
        // Updated type
        resolver: zodResolver(taskFormSchema), // Renamed schema
        defaultValues: {
            title: task?.title || "", // Use task prop
            description: task?.description || "", // Use task prop
            images: task?.images || [], // Use task prop
            location: task?.location, // Use task prop
        },
    });

    useEffect(() => {
        if (task?.location) {
            // Use task prop
            setLocation(task.location); // Use task prop
        }
    }, [task?.location]); // Use task prop

    const handleImageChange = (items: ImageItem[]) => {
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) return item.file;
                if (item.existingMediaUrl) {
                    // Use task prop
                    return task?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: TaskFormValues) => {
        // Updated type
        setIsSubmitting(true);
        console.log("[TaskForm] handleSubmit called. isEditing:", isEditing, "taskId:", taskId); // Updated log

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
            let result: { success: boolean; message?: string; taskId?: string }; // Renamed property
            if (isEditing && taskId) {
                // Use taskId
                console.log(`[TaskForm] Calling updateTaskAction with taskId: ${taskId}`); // Updated log
                result = await updateTaskAction(circleHandle, taskId, formData); // Renamed action, use taskId
            } else {
                console.log("[TaskForm] Calling createTaskAction"); // Updated log
                result = await createTaskAction(circleHandle, formData); // Renamed action
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Task Updated" : "Task Submitted", // Updated text
                    description:
                        result.message || (isEditing ? "Task successfully updated." : "Task successfully submitted."), // Updated text
                });

                const navigateToId = isEditing ? taskId : result.taskId; // Use taskId, result.taskId
                if (navigateToId) {
                    router.push(`/circles/${circleHandle}/tasks/${navigateToId}`); // Updated path
                    router.refresh();
                } else {
                    router.push(`/circles/${circleHandle}/tasks`); // Updated path
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
            {/* TODO: Add stage timeline if needed for editing */}
            {/* {isEditing && task.stage && ( <TaskStageTimeline currentStage={task.stage} /> )} */}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{isEditing ? "Edit Task" : "Create New Task"}</CardTitle> {/* Updated text */}
                    <CardDescription>
                        {isEditing ? "Update the task details below." : "Describe the task you want to create."}{" "}
                        {/* Updated text */}
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
                                        <FormLabel>Task Title</FormLabel> {/* Updated text */}
                                        <FormControl>
                                            <Input
                                                placeholder="e.g., Organize team meeting" // Updated placeholder
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>A short, clear title for the task.</FormDescription>{" "}
                                        {/* Updated text */}
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
                                                placeholder="Provide details about the task, goals, and any relevant context..." // Updated placeholder
                                                className="min-h-[200px]"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>Explain the task in detail.</FormDescription>{" "}
                                        {/* Updated text */}
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
                                                initialImages={task?.images || []} // Use task prop
                                                onChange={handleImageChange}
                                                maxImages={5}
                                                previewMode="compact"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Upload images related to the task (max 5 files, 5MB each).{" "}
                                            {/* Updated text */}
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
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            router.push(
                                                `/circles/${circle.handle}/tasks${task?._id ? `/${task._id}` : ""}`, // Updated path, use task prop
                                            )
                                        }
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {isEditing ? "Update Task" : "Create Task"} {/* Updated text */}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                <DialogContent>
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
