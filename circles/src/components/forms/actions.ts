"use server";

import { generateZodSchema } from "@/lib/utils/form";
import { formActions } from "@/components/forms/form-actions";
import { formSchemas } from "@/components/forms/form-schemas";
import { FormSubmitResponse, Page } from "@/models/models";
import { ZodError } from "zod";

export async function onFormSubmit(
    formSchemaId: string,
    values: Record<string, any>,
    page: Page,
): Promise<FormSubmitResponse> {
    try {
        const formSchema = formSchemas[formSchemaId];
        const zodSchema = generateZodSchema(formSchema.fields);

        // validate form values
        await zodSchema.parseAsync(values);

        // call form server action
        const formAction = formActions[formSchemaId];
        const { onSubmit } = formAction;
        let response = await onSubmit(values, page);

        return response;
    } catch (error) {
        if (error instanceof ZodError) {
            return { success: false, message: "Form validation failed. " + JSON.stringify(error.format()) };
        } else if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to submit the form. " + JSON.stringify(error) };
        }
    }
}
