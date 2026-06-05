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
    fundingAskCategorySchema,
    fundingAskCurrencySchema,
    type Circle,
    type FundingAskDisplay,
} from "@/models/models";
import {
    fundingBeneficiaryTypeLabels,
    fundingCategoryOptions,
    fundingCurrencyOptions,
    formatFundingAmount,
} from "./funding-shared";

const beneficiaryOptions = Object.entries(fundingBeneficiaryTypeLabels).map(([value, label]) => ({
    value,
    label,
}));

const fundingFormItemSchema = z.object({
    title: z.string().trim().min(1, "Item title is required"),
    category: fundingAskCategorySchema,
    price: z.number().positive("Item price must be greater than zero"),
    currency: fundingAskCurrencySchema,
    quantity: z.number().positive("Quantity must be greater than zero").optional(),
    unitLabel: z.preprocess(
        (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
        z.string().max(80, "Unit label must be 80 characters or fewer").optional(),
    ),
    note: z.preprocess(
        (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
        z.string().max(280, "Short note must be 280 characters or fewer").optional(),
    ),
});

const fundingFormSchema = z
    .object({
        title: z.string().trim().min(1, "Title is required"),
        shortStory: z.string().trim().min(1, "Short story is required").max(280, "Short story is too long"),
        description: z.string().optional(),
        items: z.array(fundingFormItemSchema).min(1, "Add at least one funding item"),
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
    })
    .superRefine((value, context) => {
        if (value.isProxy && !value.beneficiaryName) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["beneficiaryName"],
                message: "Beneficiary name is required for proxy requests",
            });
        }
    });

type FundingFormValues = z.infer<typeof fundingFormSchema>;
type FundingFormSubmissionValues = FundingFormValues & { publishToNoticeboard: boolean };

type FundingFormProps = {
    circle: Circle;
    ask?: FundingAskDisplay;
};

const steps = [
    { key: "request", title: "Request", description: "Add the parent funding request title, story, and broader project context." },
    { key: "items", title: "Items", description: "Add one or more individually fundable child items." },
    { key: "beneficiary", title: "Beneficiary", description: "Add proxy or beneficiary context if it helps clarify the request." },
    { key: "image", title: "Image", description: "Add an optional cover image for the parent request." },
    { key: "review", title: "Review", description: "Check the funding request and its child items before saving or publishing." },
] as const;

const fieldsByStep: Array<Array<keyof FundingFormValues>> = [
    ["title", "shortStory", "description"],
    ["items"],
    ["isProxy", "beneficiaryType", "beneficiaryName", "proxyNote"],
    [],
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

const getEmptyFundingItem = (): FundingFormValues["items"][number] =>
    ({
        title: "",
        category: "materials" as const,
        price: undefined as number | undefined,
        currency: "ZAR" as const,
        quantity: undefined as number | undefined,
        unitLabel: "",
        note: "",
    }) as FundingFormValues["items"][number];

const getDefaultValues = (ask?: FundingAskDisplay): FundingFormSubmissionValues => ({
    title: ask?.title || "",
    shortStory: ask?.shortStory || "",
    description: ask?.description || "",
    items: (
        ask?.items?.length
            ? ask.items.map((item) => ({
                  title: item.title,
                  category: item.category,
                  price: typeof item.price === "number" ? item.price : undefined,
                  currency: item.currency,
                  quantity: item.quantity,
                  unitLabel: item.unitLabel || "",
                  note: item.note || "",
              }))
            : [getEmptyFundingItem()]
    ) as FundingFormValues["items"],
    isProxy: ask?.isProxy || false,
    beneficiaryType: ask?.beneficiaryType || "self",
    beneficiaryName: ask?.beneficiaryName || "",
    proxyNote: ask?.proxyNote || "",
    publishToNoticeboard: true,
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

    const form = useForm<FundingFormSubmissionValues>({
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
    }, [ask, defaultValues, form]);

    const isProxy = form.watch("isProxy");
    const values = form.watch();
    const progress = ((stepIndex + 1) / steps.length) * 100;
    const visibleSavedState = searchParams.get("saved");
    const requestItems = values.items || [];

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

        formData.append("title", formValues.title);
        formData.append("shortStory", formValues.shortStory);
        formData.append("description", formValues.description || "");
        formData.append("items", JSON.stringify(formValues.items));
        formData.append("isProxy", String(formValues.isProxy));
        formData.append("beneficiaryType", formValues.isProxy ? formValues.beneficiaryType : "self");
        formData.append("beneficiaryName", formValues.beneficiaryName || "");
        formData.append("proxyNote", formValues.proxyNote || "");
        formData.append("submissionIntent", submissionIntent);
        formData.append("publishToNoticeboard", String(formValues.publishToNoticeboard));

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
                title: "Could not save funding request",
                description: result.message,
                variant: "destructive",
            });
            return;
        }

        toast({
            title: submissionIntent === "draft" ? "Draft saved" : "Funding request saved",
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
                        {isEditing ? "Edit funding request" : "Create funding request"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        One parent request can contain several individually fundable child items.
                    </p>
                </div>
                <Button asChild variant="ghost">
                    <Link href={`/circles/${circle.handle}/funding${ask?._id ? `/${ask._id}` : ""}`}>Cancel</Link>
                </Button>
            </div>

            {visibleSavedState === "draft" ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Draft saved. Draft funding requests are only visible to Super Admins until you publish them.
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
                    <div className="grid gap-2 md:grid-cols-5">
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
                                                <FormLabel>Funding request title</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Roof repair materials for the community workshop" {...field} />
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
                                                        placeholder="Explain the broader need in a few clear lines."
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
                                                <FormLabel>Full description / project context</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        rows={7}
                                                        placeholder="Add the broader project context, what the request is for, and why these items matter."
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <div className={stepIndex === 1 ? "block space-y-4" : "hidden space-y-4"}>
                                <div className="rounded-xl border border-slate-200 p-4">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-slate-900">Funding items</div>
                                            <p className="mt-1 text-sm text-slate-600">
                                                Each child item is listed separately and has its own category and price.
                                            </p>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={() => append(getEmptyFundingItem())}>
                                            Add item
                                        </Button>
                                    </div>

                                    {form.formState.errors.items?.message ? (
                                        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                            {form.formState.errors.items.message}
                                        </div>
                                    ) : null}

                                    <div className="space-y-4">
                                        {itemFields.map((itemField, index) => (
                                            <div key={itemField.id} className="rounded-lg border border-slate-200 p-4">
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div className="text-sm font-medium text-slate-900">Funding item {index + 1}</div>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                                                        Remove
                                                    </Button>
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.title`}
                                                        render={({ field }) => (
                                                            <FormItem className="md:col-span-2">
                                                                <FormLabel>Item title</FormLabel>
                                                                <FormControl>
                                                                    <Input placeholder="4 sheets of 18 mm plywood" {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.category`}
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
                                                            name={`items.${index}.price`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Price</FormLabel>
                                                                    <FormControl>
                                                                        <Input
                                                                            name={field.name}
                                                                            ref={field.ref}
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            step="0.01"
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
                                                            name={`items.${index}.currency`}
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

                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.note`}
                                                        render={({ field }) => (
                                                            <FormItem className="md:col-span-2">
                                                                <FormLabel>Short note</FormLabel>
                                                                <FormControl>
                                                                    <Textarea
                                                                        rows={3}
                                                                        placeholder="Optional extra detail for this funding item."
                                                                        {...field}
                                                                        value={field.value ?? ""}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className={stepIndex === 2 ? "block space-y-4" : "hidden space-y-4"}>
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
                                                    <FormLabel>This request is posted on behalf of someone else</FormLabel>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        Use this when the parent funding request is being posted for a person, family, group, or project.
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
                                                        <SelectValue placeholder="Choose who this request is for" />
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
                                                        <Input
                                                            placeholder="Person, family, group, or project name"
                                                            {...field}
                                                            value={field.value ?? ""}
                                                        />
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
                                                            placeholder="Explain why this request is being posted by a proxy."
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

                            <div className={stepIndex === 3 ? "block space-y-4" : "hidden space-y-4"}>
                                <div>
                                    <div className="mb-2 text-sm font-medium">Cover image</div>
                                    <MultiImageUploader
                                        initialImages={ask?.coverImage ? [{ name: "Cover image", type: "image", fileInfo: ask.coverImage }] : []}
                                        maxImages={1}
                                        onChange={setCoverImageItems}
                                        previewMode="large"
                                    />
                                    <p className="mt-2 text-sm text-slate-600">
                                        Optional. The selected image stays attached when you move between steps or save a draft.
                                    </p>
                                </div>
                            </div>

                            <div className={stepIndex === 4 ? "block space-y-4" : "hidden space-y-4"}>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="text-xl font-semibold text-slate-900">{values.title}</div>
                                    <p className="mt-2 text-sm text-slate-600">{values.shortStory}</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="rounded-xl border-slate-200 shadow-none md:col-span-2">
                                        <CardHeader>
                                            <CardTitle className="text-base">Funding items</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 text-sm text-slate-600">
                                            {requestItems.map((item, index) => (
                                                <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <div className="font-medium text-slate-900">{item.title}</div>
                                                            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                                                                {fundingCategoryOptions.find((option) => option.value === item.category)?.label}
                                                            </div>
                                                        </div>
                                                        <div className="text-sm font-medium text-slate-900">
                                                            {formatFundingAmount(item.price, item.currency)}
                                                        </div>
                                                    </div>
                                                    {item.note ? <p className="mt-2">{item.note}</p> : null}
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-base">Beneficiary</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm text-slate-600">
                                            <p>{isProxy ? "Proxy request" : "Direct request"}</p>
                                            <p>{fundingBeneficiaryTypeLabels[values.beneficiaryType]}</p>
                                            <p>{values.beneficiaryName || "No named beneficiary provided"}</p>
                                            {values.proxyNote ? <p>{values.proxyNote}</p> : null}
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-xl border-slate-200 shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-base">Image</CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-sm text-slate-600">
                                            {coverImageItems[0] ? "Cover image selected" : "No cover image selected"}
                                        </CardContent>
                                    </Card>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="publishToNoticeboard"
                                    render={({ field }) => (
                                        <FormItem className="rounded-xl border border-slate-200 p-4">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                                                />
                                                <div>
                                                    <FormLabel>Publish to Noticeboard</FormLabel>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        Create one linked Noticeboard post when this funding request is published.
                                                    </p>
                                                </div>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
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
