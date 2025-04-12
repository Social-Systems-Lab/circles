"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Media, Goal, Location } from "@/models/models"; // Use Goal types
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPinIcon, MapPin } from "lucide-react";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFullLocationName } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Import Goal Server Actions
import { createGoalAction, updateGoalAction } from "@/app/circles/[handle]/goals/actions"; // Updated actions

// Form schema for creating/editing a goal
const goalFormSchema = z.object({
    // Renamed schema
    title: z.string().min(1, { message: "Goal title is required" }), // Updated message
    description: z.string().min(1, { message: "Description is required" }),
    images: z.array(z.any()).optional(),
    location: z.any().optional(),
});

type GoalFormValues = Omit<z.infer<typeof goalFormSchema>, "images" | "location"> & {
    // Renamed type
    images?: (File | Media)[];
    location?: Location;
};

interface GoalFormProps {
    // Renamed interface
    circle: Circle;
    goal?: Goal; // Renamed prop, updated type
    circleHandle: string;
    goalId?: string; // Renamed prop
}

export const GoalForm: React.FC<GoalFormProps> = ({ circle, goal, circleHandle, goalId }) => {
    // Renamed component, props
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [location, setLocation] = useState<Location | undefined>(goal?.location); // Use goal prop
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!goal; // Use goal prop

    const form = useForm<GoalFormValues>({
        // Updated type
        resolver: zodResolver(goalFormSchema), // Renamed schema
        defaultValues: {
            title: goal?.title || "", // Use goal prop
            description: goal?.description || "", // Use goal prop
            images: goal?.images || [], // Use goal prop
            location: goal?.location, // Use goal prop
        },
    });

    useEffect(() => {
        if (goal?.location) {
            // Use goal prop
            setLocation(goal.location); // Use goal prop
        }
    }, [goal?.location]); // Use goal prop

    const handleImageChange = (items: ImageItem[]) => {
        const formImages: (File | Media)[] = items
            .map((item) => {
                if (item.file) return item.file;
                if (item.existingMediaUrl) {
                    // Use goal prop
                    return goal?.images?.find((img) => img.fileInfo.url === item.existingMediaUrl) || null;
                }
                return null;
            })
            .filter((img): img is File | Media => img !== null);
        form.setValue("images", formImages, { shouldValidate: true });
    };

    const handleSubmit = async (values: GoalFormValues) => {
        // Updated type
        setIsSubmitting(true);
        console.log("[GoalForm] handleSubmit called. isEditing:", isEditing, "goalId:", goalId); // Updated log

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
            let result: { success: boolean; message?: string; goalId?: string }; // Renamed property
            if (isEditing && goalId) {
                // Use goalId
                console.log(`[GoalForm] Calling updateGoalAction with goalId: ${goalId}`); // Updated log
                result = await updateGoalAction(circleHandle, goalId, formData); // Renamed action, use goalId
            } else {
                console.log("[GoalForm] Calling createGoalAction"); // Updated log
                result = await createGoalAction(circleHandle, formData); // Renamed action
            }

            if (result.success) {
                toast({
                    title: isEditing ? "Goal Updated" : "Goal Submitted", // Updated text
                    description:
                        result.message || (isEditing ? "Goal successfully updated." : "Goal successfully submitted."), // Updated text
                });

                const navigateToId = isEditing ? goalId : result.goalId; // Use goalId, result.goalId
                if (navigateToId) {
                    router.push(`/circles/${circleHandle}/goals/${navigateToId}`); // Updated path
                    router.refresh();
                } else {
                    router.push(`/circles/${circleHandle}/goals`); // Updated path
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
            {/* {isEditing && goal.stage && ( <GoalStageTimeline currentStage={goal.stage} /> )} */}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>{isEditing ? "Edit Goal" : "Create New Goal"}</CardTitle> {/* Updated text */}
                    <CardDescription>
                        {isEditing ? "Update the goal details below." : "Describe the goal you want to create."}{" "}
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
                                        <FormLabel>Goal Title</FormLabel> {/* Updated text */}
                                        <FormControl>
                                            <Input
                                                placeholder="e.g., Organize team meeting" // Updated placeholder
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>A short, clear title for the goal.</FormDescription>{" "}
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
                                                placeholder="Provide details about the goal, goals, and any relevant context..." // Updated placeholder
                                                className="min-h-[200px]"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>Explain the goal in detail.</FormDescription>{" "}
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
                                                initialImages={goal?.images || []} // Use goal prop
                                                onChange={handleImageChange}
                                                maxImages={5}
                                                previewMode="compact"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Upload images related to the goal (max 5 files, 5MB each).{" "}
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
                                                `/circles/${circle.handle}/goals${goal?._id ? `/${goal._id}` : ""}`, // Updated path, use goal prop
                                            )
                                        }
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {isEditing ? "Update Goal" : "Create Goal"} {/* Updated text */}
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
