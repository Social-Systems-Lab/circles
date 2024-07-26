import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Question } from "@/models/models";
import { useForm, Controller } from "react-hook-form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type CircleQuestionnaireDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (answers: Record<string, string>) => void;
    questions: Question[];
};

export const CircleQuestionnaireDialog: React.FC<CircleQuestionnaireDialogProps> = ({
    isOpen,
    onClose,
    onSubmit,
    questions,
}) => {
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm();

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Circle Questionnaire</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {questions.map((question, index) => (
                        <div key={index} className="space-y-2">
                            <Label>{question.question}</Label>
                            {question.type === "text" ? (
                                <Controller
                                    name={`question_${index}`}
                                    control={control}
                                    rules={{ required: "This field is required" }}
                                    render={({ field }) => (
                                        <input {...field} type="text" className="w-full rounded border p-2" />
                                    )}
                                />
                            ) : (
                                <Controller
                                    name={`question_${index}`}
                                    control={control}
                                    rules={{ required: "This field is required" }}
                                    render={({ field }) => (
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex space-x-4"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="yes" id={`yes_${index}`} />
                                                <Label htmlFor={`yes_${index}`}>Yes</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="no" id={`no_${index}`} />
                                                <Label htmlFor={`no_${index}`}>No</Label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                            )}
                            {errors[`question_${index}`] && (
                                <p className="text-sm text-red-500">{errors[`question_${index}`]?.message as string}</p>
                            )}
                        </div>
                    ))}
                    <Button type="submit" className="w-full">
                        Submit
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
