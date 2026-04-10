"use client";

import React from "react";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
    fundingAskBeneficiaryTypeSchema,
    fundingAskCurrencySchema,
    type Circle,
    type FundingAskDisplay,
} from "@/models/models";
import {
    fundingBeneficiaryTypeLabels,
    fundingCategoryOptions,
    fundingCurrencyOptions,
    formatFundingAmount,
    formatFundingItemSummary,
} from "./funding-shared";

const beneficiaryOptions = Object.entries(fundingBeneficiaryTypeLabels).map(([value, label]) => ({
    value,
    label,
}));

const fundingFormItemSchema = z
    .object({
        name: z.string(),
        quantity: z.number().positive("Quantity must be greater than zero").optional(),
        unitLabel: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(80, "Unit label must be 80 characters or fewer").optional(),
        ),
        note: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(280, "Item note must be 280 characters or fewer").optional(),
        ),
    })
    .superRefine((value, context) => {
        const hasDetails = Boolean(value.quantity || value.unitLabel || value.note);
        if (hasDetails && !value.name.trim()) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["name"],
                message: "Add an item name or remove this empty row.",
            });
        }
    });

const fundingFormSchema = z
    .object({
        title: z.string().trim().min(1, "Title is required"),
        shortStory: z.string().trim().min(1, "Short story is required").max(280, "Short story is too long"),
        description: z.string().optional(),
        category: z.enum(["materials", "transport", "clothing", "education", "tools", "household", "health", "other"]),
        amount: z.coerce.number().positive("Total amount must be greater than zero"),
        currency: fundingAskCurrencySchema,
        items: z.array(fundingFormItemSchema),
        isProxy: z.boolean().default(false),
        beneficiaryType: fundingAskBeneficiaryTypeSchema,
        beneficiaryName: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(120, "Beneficiary name must be 120 characters or fewer").optional(),
        ),
        proxyNote: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(500, "Proxy note must be 500 characters or fewer").optional(),
        ),
        completionPlan: z
            .string()
            .trim()
            .min(1, "Please explain how donors will know this was fulfilled.")
            .max(1000, "Confirmation note is too long"),
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
    { key: "basics", title: "Basics", description: "What is the ask, what items are included, and what is the total amount?" },
    { key: "beneficiary", title: "Beneficiary", description: "Who is this for?" },
    { key: "proof", title: "Proof / image", description: "Add an image and explain how you will confirm the outcome." },
    { key: "review", title: "Review", description: "Check the ask before saving or publishing." },
] as const;

const fieldsByStep: Array<Array<keyof FundingFormValues>> = [
    ["title", "shortStory", "category", "amount", "currency"],
    ["isProxy", "beneficiaryType", "beneficiaryName", "proxyNote"],
    ["completionPlan"],
    [],
];

const getInitialCoverImageItems = (ask?: FundingAskDisplay): ImageItem[] =>
    ask?.coverImage
        ? [
              {
                  id: ask.coverImage.url,
                  preview: ask.coverImage.url,
                  existingMediaUrl: ask.coverImage.url,
              },
          ]
        : [];

const getDefaultValues = (ask?: FundingAskDisplay): FundingFormValues => ({
    title: ask?.title || "",
    shortStory: ask?.shortStory || "",
    description: ask?.description || "",
    category: ask?.category || "materials",
    amount: ask?.amount || 0,
    currency: ask?.currency === "USD" || ask?.currency === "EUR" || ask?.currency === "ZAR" ? ask.currency : "ZAR",
    items: ask?.items || [],
    isProxy: ask?.isProxy || false,
    beneficiaryType: ask?.beneficiaryType || "self",
    beneficiaryName: ask?.beneficiaryName || "",
    proxyNote: ask?.proxyNote || "",
    completionPlan: ask?.completionPlan || "",
});

const getEmptyLineItem = () => ({
    name: "",
    quantity: undefined as number | undefined,
    unitLabel: "",
    note: "",
});

export function FundingForm({ circle, ask }: FundingFormProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [stepIndex, setStepIndex] = React.useState(0);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [coverImageItems, setCoverImageItems] = React.useState<ImageItem[]>(() => getInitialCoverImageItems(ask));
    const isEditing = Boolean(ask);
    const defaultValues = React.useMemo(() => getDefaultValues(ask), [ask]);

    const form = useForm<FundingFormValues>({
        resolver: zodResolver(fundingFormSchema),
        defaultValues,
        shouldUnregister: false,
    });

    const { fields: itemFields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    React.useEffect(() => {
        form.reset(defaultValues);
        setCoverImageItems(getInitialCoverImageItems(ask));
        setStepIndex(0);
    }, [ask?._id, defaultValues, form, isEditing]);

    const isProxy = form.watch("isProxy");
    const values = form.watch();
    const progress = ((stepIndex + 1) / steps.length) * 100;
    const visibleSavedState = searchParams.get("saved");
    const visibleItems = values.items?.filter((item) => item.name?.trim()) || [];

    const goToStep = async (nextIndex: number) => {
        if (nextIndex <= stepIndex) {
            setStepIndex(nextIndex);
            return;
        }

        const fields = fieldsByStep[stepIndex];
        if (!fields.length) {
            setStepIndex(nextIndex);
            return;
        }

        const valid = await form.trigger(fields);
        if (valid) {
            setStepIndex(nextIndex);
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
        const normalizedItems = (formValues.items || [])
            .map((item) => ({
                name: item.name.trim(),
                quantity: item.quantity,
                unitLabel: item.unitLabel?.trim() || undefined,
                note: item.note?.trim() || undefined,
            }))
            .filter((item) => item.name);

        formData.append("title", formValues.title);
        formData.append("shortStory", formValues.shortStory);
        formData.append("description", formValues.description || "");
        formData.append("category", formValues.category);
        formData.append("amount", String(formValues.amount));
        formData.append("currency", formValues.currency);
        formData.append("items", JSON.stringify(normalizedItems));
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

        const result =
            isEditing && ask?._id
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

        const savedAskId = result.askId || ask?._id?.toString();
        if (!savedAskId) {
            router.refresh();
            return;
        }

        if (submissionIntent === "draft") {
            router.push(`/circles/${circle.handle}/funding/${savedAskId}/edit?saved=draft`);
        } else {
            router.push(`/circles/${circle.handle}/funding/${savedAskId}`);
        }
        router.refresh();
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 pb-8">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-bold text-slate-900">
                        {isEditing ? "Edit funding ask" : "Create funding ask"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Keep it concrete: one ask, one total amount, one active supporter at a time.
                    </p>
                </div>
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding${ask?._id ? `/${ask._id}` : ""}`}>Cancel</Link>
                </Button>
            </div>

            {visibleSavedState === "draft" ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Draft saved. Only you and circle admins can see draft asks until you publish them.
                </div>
            ) : null}

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
                                onClick={() => void goToStep(index)}
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
                            <div className={stepIndex === 0 ? "block space-y-6" : "hidden space-y-6"}>
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
                                                    <Textarea
                                                        rows={6}
                                                        placeholder="Optional extra context for members."
                                                        {...field}
                                                    />
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

                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),180px]">
                                        <FormField
                                            control={form.control}
                                            name="amount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Total amount</FormLabel>
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
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Currency" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {fundingCurrencyOptions.map((option) => (
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
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 p-4">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-slate-900">Items included in this ask</div>
                                            <p className="mt-1 text-sm text-slate-600">
                                                Optional. Add the concrete items covered by this one total amount.
                                            </p>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={() => append(getEmptyLineItem())}>
                                            Add item
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        {itemFields.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                                No line items added yet. You can still publish a single concrete ask with just a title and total amount.
                                            </div>
                                        ) : null}

                                        {itemFields.map((itemField, index) => (
                                            <div key={itemField.id} className="rounded-lg border border-slate-200 p-4">
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div className="text-sm font-medium text-slate-900">Item {index + 1}</div>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                                                        Remove
                                                    </Button>
                                                </div>
                                                <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr),120px,160px]">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.name`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Item name</FormLabel>
                                                                <FormControl>
                                                                    <Input placeholder="Plywood sheets" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.quantity`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Quantity</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        name={field.name}
                                                                        ref={field.ref}
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        placeholder="Optional"
                                                                        value={field.value ?? ""}
                                                                        onBlur={field.onBlur}
                                                                        onChange={(event) =>
                                                                            field.onChange(
                                                                                event.target.value ? Number(event.target.value) : undefined,
                                                                            )
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.unitLabel`}
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

                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.note`}
                                                    render={({ field }) => (
                                                        <FormItem className="mt-4">
                                                            <FormLabel>Short detail</FormLabel>
                                                            <FormControl>
                                                                <Textarea
                                                                    rows={3}
                                                                    placeholder="Optional extra detail for this item."
                                                                    {...field}
                                                                    value={field.value ?? ""}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className={stepIndex === 1 ? "block space-y-4" : "hidden space-y-4"}>
                                <FormField
                                    control={form.control}
                                    name="isProxy"
                                    render={({ field }) => (
                                        <FormItem className="rounded-xl border border-slate-200 p-4">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                                                />
                                                <div>
                                                    <FormLabel>This is a proxy ask for someone else</FormLabel>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        Turn this on when the creator is asking on behalf of a person, family, group, or project.
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

                                {isProxy ? (
                                    <>
                                        <FormField
                                            control={form.control}
                                            name="beneficiaryName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Beneficiary name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Child, family, school group, project name, etc." {...field} value={field.value ?? ""} />
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
                                ) : null}
                            </div>

                            <div className={stepIndex === 2 ? "block space-y-4" : "hidden space-y-4"}>
                                <div>
                                    <div className="mb-2 text-sm font-medium">Cover image</div>
                                    <MultiImageUploader
                                        initialImages={ask?.coverImage ? [{ name: "Cover image", type: "image", fileInfo: ask.coverImage }] : []}
                                        maxImages={1}
                                        onChange={setCoverImageItems}
                                        previewMode="large"
                                    />
                                    <p className="mt-2 text-sm text-slate-600">
                                        Optional. The selected image stays attached to this draft unless you remove it.
                                    </p>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="completionPlan"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>How will donors know this was fulfilled?</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={5}
                                                    placeholder="Explain how you will confirm the outcome, for example with an update, photo, receipt, or short note."
                                                    {...field}
                                                />
                                            </FormControl>
                                            <p className="text-sm text-slate-600">
                                                Explain how you will confirm the outcome, for example with an update, photo, receipt, or short note.
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className={stepIndex === 3 ? "block space-y-4" : "hidden space-y-4"}>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="text-xl font-semibold text-slate-900">{values.title}</div>
                                    <p className="mt-2 text-sm text-slate-600">{values.shortStory}</p>
                                    <div className="mt-3 text-sm font-medium text-slate-800">
                                        {formatFundingAmount(values.amount || 0, values.currency || "ZAR")}
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="rounded-xl border-slate-200 shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-base">Items</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm text-slate-600">
                                            {visibleItems.length > 0 ? (
                                                visibleItems.map((item, index) => (
                                                    <div key={`${item.name}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                                        <div className="font-medium text-slate-900">{formatFundingItemSummary(item)}</div>
                                                        {item.note ? <p className="mt-1">{item.note}</p> : null}
                                                    </div>
                                                ))
                                            ) : (
                                                <p>No line items added.</p>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-base">Beneficiary</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm text-slate-600">
                                            <p>{isProxy ? "Proxy ask" : "Direct ask"}</p>
                                            <p>{fundingBeneficiaryTypeLabels[values.beneficiaryType]}</p>
                                            <p>{values.beneficiaryName || "No named beneficiary provided"}</p>
                                            {values.proxyNote ? <p>{values.proxyNote}</p> : null}
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-none md:col-span-2">
                                        <CardHeader>
                                            <CardTitle className="text-base">How donors will know this was fulfilled</CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-sm text-slate-600">{values.completionPlan}</CardContent>
                                    </Card>
                                </div>
                            </div>

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
                                    {stepIndex < steps.length - 1 ? (
                                        <Button type="button" onClick={() => void goToStep(stepIndex + 1)} disabled={isSubmitting}>
                                            Next
                                        </Button>
                                    ) : null}
                                </div>

                                {stepIndex === steps.length - 1 ? (
                                    <div className="flex flex-wrap gap-3">
                                        {!isEditing || ask?.status === "draft" ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => void handleSubmit("draft")}
                                                    disabled={isSubmitting}
                                                >
                                                    {isSubmitting ? "Saving..." : "Save draft"}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => void handleSubmit("publish")}
                                                    disabled={isSubmitting}
                                                >
                                                    {isSubmitting ? "Saving..." : isEditing ? "Publish changes" : "Publish"}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type="button"
                                                onClick={() => void handleSubmit("update")}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? "Saving..." : "Save changes"}
                                            </Button>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
