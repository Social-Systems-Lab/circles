"use client";

import React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { MultiImageUploader, type ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { useToast } from "@/components/ui/use-toast";
import { createFundingAskAction, updateFundingAskAction } from "@/app/circles/[handle]/funding/actions";
import type { Circle, FundingAskDisplay } from "@/models/models";
import { fundingCategoryOptions, formatFundingAmount } from "./funding-shared";

const beneficiaryOptions = [
    { value: "self", label: "My circle / direct need" },
    { value: "person", label: "A person" },
    { value: "family", label: "A family" },
    { value: "community", label: "A community" },
    { value: "group", label: "A group" },
    { value: "other", label: "Other" },
] as const;

const fundingFormSchema = z
    .object({
        title: z.string().trim().min(1, "Title is required"),
        shortStory: z.string().trim().min(1, "Short story is required").max(280, "Short story is too long"),
        description: z.string().optional(),
        category: z.enum(["materials", "transport", "clothing", "education", "tools", "household", "health", "other"]),
        amount: z.coerce.number().positive("Amount must be greater than zero"),
        currency: z.string().trim().min(1, "Currency is required").max(8, "Currency must be short"),
        quantity: z.preprocess(
            (value) => (value === "" || value == null ? undefined : Number(value)),
            z.number().positive("Quantity must be greater than zero").optional(),
        ),
        unitLabel: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(80, "Unit label must be 80 characters or fewer").optional(),
        ),
        isProxy: z.boolean().default(false),
        beneficiaryType: z.enum(["self", "person", "family", "community", "group", "other"]),
        beneficiaryName: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(120, "Beneficiary name must be 120 characters or fewer").optional(),
        ),
        proxyNote: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(500, "Proxy note must be 500 characters or fewer").optional(),
        ),
        completionPlan: z.string().trim().min(1, "Completion plan is required").max(1000, "Completion plan is too long"),
    })
    .superRefine((value, context) => {
        if (value.isProxy && !value.beneficiaryName) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["beneficiaryName"],
                message: "Beneficiary name is required for proxy asks",
            });
        }
    });

type FundingFormValues = z.infer<typeof fundingFormSchema>;

type FundingFormProps = {
    circle: Circle;
    ask?: FundingAskDisplay;
};

const steps = [
    { key: "basics", title: "Basics", description: "What is the ask and how much does it cost?" },
    { key: "beneficiary", title: "Beneficiary", description: "Who is this for?" },
    { key: "proof", title: "Proof / image", description: "Add evidence and explain how completion will be confirmed." },
    { key: "review", title: "Review", description: "Check the ask before saving or publishing." },
] as const;

const fieldsByStep: Array<Array<keyof FundingFormValues>> = [
    ["title", "shortStory", "category", "amount", "currency"],
    ["isProxy", "beneficiaryType", "beneficiaryName", "proxyNote"],
    ["completionPlan"],
    [],
];

export function FundingForm({ circle, ask }: FundingFormProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [stepIndex, setStepIndex] = React.useState(0);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [coverImageItems, setCoverImageItems] = React.useState<ImageItem[]>(() =>
        ask?.coverImage
            ? [
                  {
                      id: ask.coverImage.url,
                      preview: ask.coverImage.url,
                      existingMediaUrl: ask.coverImage.url,
                  },
              ]
            : [],
    );
    const isEditing = Boolean(ask);

    const form = useForm<FundingFormValues>({
        resolver: zodResolver(fundingFormSchema),
        defaultValues: {
            title: ask?.title || "",
            shortStory: ask?.shortStory || "",
            description: ask?.description || "",
            category: ask?.category || "materials",
            amount: ask?.amount || 0,
            currency: ask?.currency || "USD",
            quantity: ask?.quantity,
            unitLabel: ask?.unitLabel || "",
            isProxy: ask?.isProxy || false,
            beneficiaryType: ask?.beneficiaryType || "self",
            beneficiaryName: ask?.beneficiaryName || "",
            proxyNote: ask?.proxyNote || "",
            completionPlan: ask?.completionPlan || "",
        },
    });

    const isProxy = form.watch("isProxy");
    const values = form.watch();
    const progress = ((stepIndex + 1) / steps.length) * 100;

    const goToNextStep = async () => {
        const fields = fieldsByStep[stepIndex];
        if (!fields.length) {
            setStepIndex((current) => Math.min(current + 1, steps.length - 1));
            return;
        }

        const valid = await form.trigger(fields);
        if (valid) {
            setStepIndex((current) => Math.min(current + 1, steps.length - 1));
        }
    };

    const handleSubmit = async (submissionIntent: "draft" | "publish" | "update") => {
        const valid = await form.trigger();
        if (!valid) {
            return;
        }

        setIsSubmitting(true);
        const formValues = form.getValues();
        const formData = new FormData();
        formData.append("title", formValues.title);
        formData.append("shortStory", formValues.shortStory);
        formData.append("description", formValues.description || "");
        formData.append("category", formValues.category);
        formData.append("amount", String(formValues.amount));
        formData.append("currency", formValues.currency.toUpperCase());
        formData.append("quantity", formValues.quantity ? String(formValues.quantity) : "");
        formData.append("unitLabel", formValues.unitLabel || "");
        formData.append("isProxy", String(formValues.isProxy));
        formData.append("beneficiaryType", formValues.isProxy ? formValues.beneficiaryType : "self");
        formData.append("beneficiaryName", formValues.beneficiaryName || "");
        formData.append("proxyNote", formValues.proxyNote || "");
        formData.append("completionPlan", formValues.completionPlan);
        formData.append("submissionIntent", submissionIntent);

        const primaryCoverImage = coverImageItems[0];
        if (primaryCoverImage?.file) {
            formData.append("coverImage", primaryCoverImage.file);
        } else if (ask?.coverImage && primaryCoverImage?.existingMediaUrl) {
            formData.append("coverImage", JSON.stringify(ask.coverImage));
        }

        const result = isEditing && ask?._id
            ? await updateFundingAskAction(circle.handle!, ask._id.toString(), formData)
            : await createFundingAskAction(circle.handle!, formData);

        setIsSubmitting(false);

        if (!result.success) {
            toast({
                title: "Could not save funding ask",
                description: result.message,
                variant: "destructive",
            });
            return;
        }

        toast({
            title: submissionIntent === "draft" ? "Draft saved" : "Funding ask saved",
            description: result.message,
        });

        router.push(`/circles/${circle.handle}/funding/${result.askId || ask?._id}`);
        router.refresh();
    };

    const renderCurrentStep = () => {
        if (stepIndex === 0) {
            return (
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <FormLabel>Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="4 sheets of 18 mm plywood" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="shortStory"
                        render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <FormLabel>Short story</FormLabel>
                                <FormControl>
                                    <Textarea
                                        rows={3}
                                        placeholder="Explain the concrete need in a few lines."
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <FormLabel>Full description</FormLabel>
                                <FormControl>
                                    <Textarea rows={6} placeholder="Optional extra context for members." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {fundingCategoryOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Amount</FormLabel>
                                <FormControl>
                                    <Input type="number" inputMode="decimal" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <FormControl>
                                    <Input placeholder="USD" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Quantity</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="Optional"
                                        value={field.value ?? ""}
                                        onChange={field.onChange}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="unitLabel"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unit label</FormLabel>
                                <FormControl>
                                    <Input placeholder="sheets, pairs, boxes" {...field} value={field.value ?? ""} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            );
        }

        if (stepIndex === 1) {
            return (
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="isProxy"
                        render={({ field }) => (
                            <FormItem className="rounded-xl border border-slate-200 p-4">
                                <div className="flex items-start gap-3">
                                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                                    <div>
                                        <FormLabel>This is a proxy ask for someone else</FormLabel>
                                        <p className="mt-1 text-sm text-slate-600">
                                            Turn this on when the creator is asking on behalf of a beneficiary.
                                        </p>
                                    </div>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="beneficiaryType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Beneficiary type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose who this ask is for" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {beneficiaryOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {isProxy && (
                        <>
                            <FormField
                                control={form.control}
                                name="beneficiaryName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Beneficiary name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Child, family, school group, etc." {...field} value={field.value ?? ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="proxyNote"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Proxy note</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                rows={4}
                                                placeholder="Explain why the ask is being posted by a proxy."
                                                {...field}
                                                value={field.value ?? ""}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </>
                    )}
                </div>
            );
        }

        if (stepIndex === 2) {
            return (
                <div className="space-y-4">
                    <div>
                        <div className="mb-2 text-sm font-medium">Cover image</div>
                        <MultiImageUploader
                            initialImages={ask?.coverImage ? [{ name: "Cover image", type: "image", fileInfo: ask.coverImage }] : []}
                            maxImages={1}
                            onChange={setCoverImageItems}
                            previewMode="large"
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="completionPlan"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Completion plan</FormLabel>
                                <FormControl>
                                    <Textarea
                                        rows={5}
                                        placeholder="How will members know this need was fulfilled?"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xl font-semibold text-slate-900">{values.title}</div>
                    <p className="mt-2 text-sm text-slate-600">{values.shortStory}</p>
                    <div className="mt-3 text-sm font-medium text-slate-800">
                        {formatFundingAmount(values.amount || 0, values.currency || "USD")}
                    </div>
                    {values.quantity && values.unitLabel ? (
                        <div className="mt-1 text-sm text-slate-600">
                            {values.quantity} {values.unitLabel}
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-xl border-slate-200 shadow-none">
                        <CardHeader>
                            <CardTitle className="text-base">Beneficiary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-600">
                            <p>{isProxy ? "Proxy ask" : "Direct ask"}</p>
                            <p>{values.beneficiaryName || "No named beneficiary provided"}</p>
                            {values.proxyNote ? <p>{values.proxyNote}</p> : null}
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl border-slate-200 shadow-none">
                        <CardHeader>
                            <CardTitle className="text-base">Completion</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-600">{values.completionPlan}</CardContent>
                    </Card>
                </div>
            </div>
        );
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 pb-8">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-bold text-slate-900">
                        {isEditing ? "Edit funding ask" : "Create funding ask"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Keep it concrete: one need, one total price, one ask.
                    </p>
                </div>
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding${ask?._id ? `/${ask._id}` : ""}`}>Cancel</Link>
                </Button>
            </div>

            <Card className="rounded-[18px] border-slate-200 shadow-sm">
                <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle>{steps[stepIndex].title}</CardTitle>
                            <p className="mt-1 text-sm text-slate-600">{steps[stepIndex].description}</p>
                        </div>
                        <div className="text-sm text-slate-500">
                            Step {stepIndex + 1} of {steps.length}
                        </div>
                    </div>
                    <Progress value={progress} />
                    <div className="grid gap-2 md:grid-cols-4">
                        {steps.map((step, index) => (
                            <button
                                key={step.key}
                                type="button"
                                onClick={() => setStepIndex(index)}
                                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                                    index === stepIndex
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-600"
                                }`}
                            >
                                {step.title}
                            </button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={(event) => event.preventDefault()} className="space-y-6">
                            {renderCurrentStep()}

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
                                <div className="flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                                        disabled={stepIndex === 0 || isSubmitting}
                                    >
                                        Back
                                    </Button>
                                    {stepIndex < steps.length - 1 && (
                                        <Button type="button" onClick={goToNextStep} disabled={isSubmitting}>
                                            Next
                                        </Button>
                                    )}
                                </div>

                                {stepIndex === steps.length - 1 && (
                                    <div className="flex flex-wrap gap-3">
                                        {!isEditing || ask?.status === "draft" ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => handleSubmit("draft")}
                                                    disabled={isSubmitting}
                                                >
                                                    Save draft
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => handleSubmit("publish")}
                                                    disabled={isSubmitting}
                                                >
                                                    {isSubmitting ? "Saving..." : isEditing ? "Publish changes" : "Publish"}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type="button"
                                                onClick={() => handleSubmit("update")}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? "Saving..." : "Save changes"}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
