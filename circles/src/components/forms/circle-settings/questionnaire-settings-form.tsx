"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Circle, Question } from "@/models/models";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useForm, Controller, Control, useFieldArray } from "react-hook-form";
import { saveQuestionnaire } from "@/app/circles/[handle]/settings/questionnaire/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Trash2 } from "lucide-react";

interface QuestionnaireSettingsFormProps {
    circle: Circle;
}

export function QuestionnaireSettingsForm({ circle }: QuestionnaireSettingsFormProps): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ensure all questions have a type
    const normalizedQuestionnaire = (circle.questionnaire || []).map((q) => ({
        ...q,
        type: q.type || "text", // Default to "text" if type is missing
    }));

    const form = useForm({
        defaultValues: {
            _id: circle._id,
            questionnaire: normalizedQuestionnaire,
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "questionnaire",
    });

    const addNewQuestion = () => {
        append({
            question: "",
            type: "text", // Explicitly set default type
        });
    };

    const onSubmit = async (data: { _id: any; questionnaire: Question[] }) => {
        setIsSubmitting(true);
        try {
            // Validate questions
            const invalidQuestions = data.questionnaire.filter((q) => !q.question || !q.type);

            if (invalidQuestions.length > 0) {
                toast({
                    title: "Error",
                    description: "All questions must have both a question text and a type",
                    variant: "destructive",
                });
                setIsSubmitting(false);
                return;
            }

            const result = await saveQuestionnaire(data);
            if (result.success) {
                toast({
                    title: "Success",
                    description: "Questionnaire updated successfully",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update questionnaire",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted space-y-6">
                <div className="space-y-4">
                    {fields.map((field, index) => (
                        <Card key={field.id}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Question Text</label>
                                    <Input
                                        {...form.register(`questionnaire.${index}.question`)}
                                        placeholder="Enter your question here"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Question Type</label>
                                    <Controller
                                        control={form.control}
                                        name={`questionnaire.${index}.type`}
                                        defaultValue="text"
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select question type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="text">Text (Free response)</SelectItem>
                                                    <SelectItem value="yesno">Yes/No</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Button type="button" variant="outline" onClick={addNewQuestion} className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Question
                </Button>

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
            </form>
        </Form>
    );
}
