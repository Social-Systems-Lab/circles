"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import Link from "next/link";
import { DynamicField } from "@/components/forms/dynamic-field";
import { generateZodSchema } from "@/lib/utils/form";
import { FormSchema } from "@/models/models";
import { useEffect, useState, useTransition } from "react";
import { formSchemas } from "@/components/forms/form-schemas";
import { onFormSubmit } from "./actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { formActionHandlers } from "@/components/forms/form-action-handlers";

interface DynamicFormProps {
    initialFormData?: Record<string, any>;
    formData?: Record<string, any>;
    formSchemaId: string;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({ initialFormData = {}, formData = {}, formSchemaId }) => {
    const formSchema = formSchemas[formSchemaId];
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

    const onSubmit = async (values: Record<string, any>) => {
        setFormError(null);
        startTransition(async () => {
            let result = await onFormSubmit(formSchemaId, values);

            // call client action handler
            const formActionHandler = formActionHandlers[formSchemaId];
            if (formActionHandler) {
                const { onHandleSubmit } = formActionHandler;
                result = await onHandleSubmit(result, router);
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
        <div className="flex flex-1 flex-row items-center justify-center pl-6 pr-6">
            <div className="max-w-[400px] flex-1">
                <h1 className="m-0 p-0 pb-2 text-3xl font-bold">{title}</h1>
                <p className="pb-4 text-gray-500">{description}</p>
                <Form {...form}>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" autoComplete="off">
                        {/* fake fields are a workaround for chrome/opera autofill getting the wrong fields */}
                        <input id="username" style={{ display: "none" }} type="text" name="fakeusernameremembered" />
                        <input
                            id="password"
                            style={{ display: "none" }}
                            type="password"
                            name="fakepasswordremembered"
                        />

                        {formSchema.fields.map((field) => (
                            <FormField
                                key={field.name}
                                control={control}
                                name={field.name}
                                render={({ field: formField }) => <DynamicField field={field} formField={formField} />}
                            />
                        ))}

                        <FormMessage>{formError}</FormMessage>

                        <Button className="w-full" type="submit" disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>{button.text}</>
                            )}
                        </Button>
                        {/* 
                        Show this if form is editing existing form data
                        <Button className="w-full" type="button" onClick={handleReset}>
                            Reset
                        </Button> */}
                        {footer && (
                            <p>
                                {footer.text}{" "}
                                <Link className="textLink" href={footer.link.href}>
                                    {footer.link.text}
                                </Link>
                            </p>
                        )}
                    </form>
                </Form>
            </div>
        </div>
    );
};

export default DynamicForm;
