"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { DynamicField } from "@/components/forms/dynamic-field";
import { generateZodSchema, getUserOrCircleInfo } from "@/lib/utils/form";
import { FormTools, Page } from "@/models/models";
import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { formSchemas } from "@/components/forms/form-schemas";
import { onFormSubmit } from "./actions";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { formActionHandlers } from "@/components/forms/form-action-handlers";
import { authenticatedAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "../utils/use-is-compact";

interface DynamicFormProps {
    initialFormData?: Record<string, any>;
    formData?: Record<string, any>;
    formSchemaId: string;
    maxWidth?: string;
    page?: Page;
    subpage?: string;
    showReset?: boolean;
    isUser?: boolean;
}

const DynamicFormManager: React.FC<DynamicFormProps> = ({
    initialFormData = {},
    formData = {},
    formSchemaId,
    maxWidth = "400px",
    page,
    subpage,
    showReset,
    isUser,
}) => {
    const [user, setUser] = useAtom(userAtom);
    const [authenticated, setAuthenticated] = useAtom(authenticatedAtom);
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const formTools = useMemo<FormTools>(() => {
        return { user, setUser, authenticated, setAuthenticated, searchParams, toast };
    }, [user, setUser, authenticated, setAuthenticated, searchParams, toast]);
    const formSchema = formSchemas[formSchemaId];
    if (!formSchema) throw new Error(`Form schema with id ${formSchemaId} not found`);

    const zodSchema = generateZodSchema(formSchema.fields);
    const form = useForm({
        resolver: zodResolver(zodSchema),
        defaultValues: initialFormData,
    });
    const [isPending, startTransition] = useTransition();
    const [formError, setFormError] = useState<string | null>(null);

    const { handleSubmit, control, reset, setValue } = form;
    const { title, description, footer, button } = formSchema;
    const router = useRouter();
    const isCompact = useIsCompact();

    const onSubmit = async (values: Record<string, any>) => {
        setFormError(null);
        startTransition(async () => {
            const formData = new FormData();
            Object.keys(values).forEach((key) => {
                // if key is an array object we stringify it before adding to form data
                let fieldInfo = formSchema.fields.find((x) => x.name === key);
                if (
                    fieldInfo?.type === "array" ||
                    fieldInfo?.type === "table" ||
                    fieldInfo?.type === "access-rules" ||
                    fieldInfo?.type === "location"
                ) {
                    if (values[key] !== undefined) {
                        formData.append(key, JSON.stringify(values[key]));
                    }
                    return;
                }

                formData.append(key, values[key]);
            });
            let result = await onFormSubmit(formSchemaId, formData, page, subpage);

            // call client action handler
            const formActionHandler = formActionHandlers[formSchemaId];
            if (formActionHandler) {
                const { onHandleSubmit } = formActionHandler;
                result = await onHandleSubmit(result, router, formTools);
            }

            if (!result.success) {
                setFormError(result.message ?? null);
                console.error(result.message);
            }
            console.log(result);
        });
    };

    useEffect(() => {
        if (formData) {
            Object.keys(formData).forEach((key) => {
                setValue(key, formData[key]);
            });
        }
    }, [formData, setValue]);

    const handleReset = () => {
        reset(initialFormData);
    };

    return (
        <div
            className="flex flex-1 flex-row items-center justify-center"
            style={{
                paddingLeft: isCompact ? "24px" : "24px",
                paddingRight: isCompact ? "24px" : "24px",
                paddingBottom: isCompact ? "0" : "32px",
            }}
        >
            <div className="flex-1" style={{ maxWidth: isCompact ? "none" : maxWidth }}>
                <h1 className="m-0 p-0 pb-3 text-3xl font-bold">{getUserOrCircleInfo(title, isUser)}</h1>
                <p className="pb-8 text-gray-500">{getUserOrCircleInfo(description, isUser)}</p>
                <Form {...form}>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className="space-y-8">
                            {formSchema.fields
                                .filter((x) => x.type !== "hidden")
                                .map((field) => (
                                    <FormField
                                        key={field.name}
                                        control={control}
                                        name={field.name}
                                        render={({ field: formField }) => (
                                            <DynamicField
                                                field={field}
                                                formField={formField}
                                                control={control}
                                                isUser={isUser}
                                            />
                                        )}
                                    />
                                ))}

                            <FormMessage>{formError}</FormMessage>

                            <div className="flex flex-row gap-3">
                                <Button
                                    className="w-full"
                                    type="submit"
                                    disabled={isPending}
                                    style={{
                                        maxWidth: isCompact ? "none" : "200px",
                                    }}
                                >
                                    {isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>{button.text}</>
                                    )}
                                </Button>
                                {showReset && (
                                    <Button
                                        className="w-full"
                                        type="button"
                                        onClick={handleReset}
                                        variant="outline"
                                        style={{
                                            maxWidth: isCompact ? "none" : "200px",
                                        }}
                                    >
                                        Reset
                                    </Button>
                                )}
                            </div>
                            {footer && (
                                <p>
                                    {footer.text}{" "}
                                    <Link className="textLink" href={footer.link.href}>
                                        {footer.link.text}
                                    </Link>
                                </p>
                            )}
                        </div>

                        {/* hidden fields added last to not impact layout */}
                        {formSchema.fields
                            .filter((x) => x.type === "hidden")
                            .map((field) => (
                                <FormField
                                    key={field.name}
                                    control={control}
                                    name={field.name}
                                    render={({ field: formField }) => (
                                        <DynamicField field={field} formField={formField} control={control} />
                                    )}
                                />
                            ))}

                        {/* fake fields are a workaround for chrome/opera autofill getting the wrong fields */}
                        <input id="username" style={{ display: "none" }} type="text" name="fakeusernameremembered" />
                        <input
                            id="password"
                            style={{ display: "none" }}
                            type="password"
                            name="fakepasswordremembered"
                        />
                    </form>
                </Form>
            </div>
        </div>
    );
};

export const DynamicForm: React.FC<DynamicFormProps> = ({
    initialFormData = {},
    formData = {},
    formSchemaId,
    maxWidth = "400px",
    page,
    subpage,
    showReset,
    isUser,
}) => {
    return (
        <Suspense>
            <DynamicFormManager
                initialFormData={initialFormData}
                formData={formData}
                formSchemaId={formSchemaId}
                maxWidth={maxWidth}
                page={page}
                subpage={subpage}
                showReset={showReset}
                isUser={isUser}
            />
        </Suspense>
    );
};

export default DynamicForm;
