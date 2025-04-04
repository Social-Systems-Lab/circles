"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Circle, Proposal, ProposalStage } from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProposalStageTimeline } from "./proposal-stage-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Form schema for creating/editing a proposal
const proposalFormSchema = z.object({
    name: z.string().min(1, { message: "Proposal name is required" }),
    description: z.string().min(1, { message: "Proposal description is required" }),
});

type ProposalFormValues = z.infer<typeof proposalFormSchema>;

interface ProposalFormProps {
    circle: Circle;
    proposal?: Proposal; // If provided, we're editing an existing proposal
    onSubmit: (values: ProposalFormValues) => Promise<{ success: boolean; message?: string }>;
}

export const ProposalForm: React.FC<ProposalFormProps> = ({ circle, proposal, onSubmit }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const isEditing = !!proposal;

    // Initialize form with existing proposal data if editing
    const form = useForm<ProposalFormValues>({
        resolver: zodResolver(proposalFormSchema),
        defaultValues: {
            name: proposal?.name || "",
            description: proposal?.description || "",
        },
    });

    const handleSubmit = async (values: ProposalFormValues) => {
        setIsSubmitting(true);
        try {
            const result = await onSubmit(values);
            if (result.success) {
                toast({
                    title: isEditing ? "Proposal updated" : "Proposal created",
                    description:
                        result.message ||
                        (isEditing ? "Your proposal has been updated." : "Your proposal has been created."),
                });
                // Navigate to the proposal
                router.push(`/circles/${circle.handle}/proposals/${proposal?._id}`);
            } else {
                toast({
                    title: "Error",
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
        <div className="formatted mx-auto">
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

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Provide a detailed description of your proposal"
                                                className="min-h-[200px]"
                                                {...field}
                                                disabled={isSubmitting}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Explain your proposal in detail. Include background information, goals, and
                                            any relevant context.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex justify-end space-x-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.push(`/circles/${circle.handle}/proposals/${proposal?._id}`)}
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
