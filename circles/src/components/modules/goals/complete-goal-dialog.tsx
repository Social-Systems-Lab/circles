"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
// Input is no longer directly used for file upload here
import { useToast } from "@/components/ui/use-toast";
import { completeGoalAction } from "@/app/circles/[handle]/goals/actions";
import { GoalDisplay, Media } from "@/models/models"; // Media might not be needed here if only uploading
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";

const completeGoalFormSchema = z.object({
    resultSummary: z.string().min(1, { message: "Result summary is required." }),
    resultImages: z.array(z.instanceof(File)).optional(), // Expecting an array of File objects
});

type CompleteGoalFormValues = z.infer<typeof completeGoalFormSchema>;

interface CompleteGoalDialogProps {
    goal: GoalDisplay; // Pass the full goal object
    circleHandle: string;
    children: React.ReactNode; // To use as a trigger
    onGoalCompleted?: () => void; // Optional callback after completion
}

export function CompleteGoalDialog({ goal, circleHandle, children, onGoalCompleted }: CompleteGoalDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const form = useForm<CompleteGoalFormValues>({
        resolver: zodResolver(completeGoalFormSchema),
        defaultValues: {
            resultSummary: "",
            resultImages: undefined,
        },
    });

    const onSubmit = async (values: CompleteGoalFormValues) => {
        startTransition(async () => {
            const formData = new FormData();
            formData.append("resultSummary", values.resultSummary);

            if (values.resultImages && values.resultImages.length > 0) {
                // values.resultImages is now an array of File objects
                for (const file of values.resultImages) {
                    formData.append("resultImages", file);
                }
            }

            try {
                const result = await completeGoalAction(circleHandle, goal._id as string, formData);
                if (result.success) {
                    toast({
                        title: "Goal Completed!",
                        description: result.message || "The goal has been marked as completed.",
                    });
                    setIsOpen(false);
                    form.reset();
                    if (onGoalCompleted) {
                        onGoalCompleted();
                    }
                } else {
                    toast({
                        title: "Error",
                        description: result.message || "Failed to complete the goal.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                console.error("Error completing goal:", error);
                toast({
                    title: "Error",
                    description: "An unexpected error occurred.",
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Complete Goal: {goal.title}</DialogTitle>
                    <DialogDescription>Provide a summary of the outcome and any relevant images.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="resultSummary"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Result Summary</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Describe the outcome of the goal..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="resultImages"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Result Images (Optional)</FormLabel>
                                    <FormControl>
                                        <MultiImageUploader
                                            initialImages={[]} // No initial images when completing
                                            onChange={(items: ImageItem[]) => {
                                                // Extract File objects from ImageItem[]
                                                const files = items
                                                    .map((item) => item.file)
                                                    .filter((file) => file instanceof File) as File[];
                                                field.onChange(files.length > 0 ? files : undefined); // Pass array of files or undefined
                                            }}
                                            maxImages={5}
                                            previewMode="compact"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsOpen(false)}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? "Completing..." : "Complete Goal"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
