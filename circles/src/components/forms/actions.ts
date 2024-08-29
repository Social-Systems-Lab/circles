"use server";

import { formatZodError, generateZodSchema, getFormValues } from "@/lib/utils/form";
import { formActions } from "@/components/forms/form-actions";
import { formSchemas } from "@/components/forms/form-schemas";
import { FormSubmitResponse, Page } from "@/models/models";
import { ZodError } from "zod";

export async function onFormSubmit(
    formSchemaId: string,
    values: FormData,
    page?: Page,
    subpage?: string,
    isUser?: boolean,
): Promise<FormSubmitResponse> {
    try {
        const formSchema = formSchemas[formSchemaId];
        const zodSchema = generateZodSchema(formSchema.fields);

        let formValues = getFormValues(values, formSchema);

        // validate form values
        await zodSchema.parseAsync(formValues);

        // call form server action
        const formAction = formActions[formSchemaId];
        const { onSubmit } = formAction;
        let response = await onSubmit(formValues, page, subpage, isUser);

        return response;
    } catch (error) {
        console.log("Form submit error", error);
        if (error instanceof ZodError) {
            return {
                success: false,
                message: "Form validation failed. " + formatZodError(error),
            };
        } else if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to submit the form. " + JSON.stringify(error) };
        }
    }
}
