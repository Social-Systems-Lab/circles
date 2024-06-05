import { FormField, emailSchema, getImageSchema, handleSchema, passwordSchema } from "@/models/models";
import { z, ZodSchema, ZodString } from "zod";

export const generateZodSchema = (fields: FormField[]): ZodSchema<any> => {
    const fieldSchemas = fields.reduce(
        (acc, field) => {
            let schema: z.ZodTypeAny;

            switch (field.type) {
                case "image":
                    schema = getImageSchema(field.imageMaxSize);
                    break;

                case "textarea":
                case "text":
                    schema = z.string();
                    break;

                case "email":
                    schema = emailSchema;
                    break;

                case "password":
                    schema = passwordSchema;
                    break;

                case "select":
                    if (field.options && field.options.length > 0) {
                        schema = z.enum([
                            field.options[0].value,
                            ...field.options.slice(1).map((option) => option.value),
                        ]);
                    } else {
                        throw new Error(`Enum validation for field ${field.name} requires at least one option.`);
                    }
                    break;

                case "handle":
                    schema = handleSchema;
                    break;

                default:
                    schema = z.string();
                    break;
            }

            // check if schema is ZodString
            if (schema instanceof ZodString) {
                if (field.minLength) {
                    schema = (schema as ZodString).min(field.minLength, {
                        message: field.validationMessage,
                    });
                }

                if (field.maxLength) {
                    schema = (schema as ZodString).max(field.maxLength, {
                        message: field.validationMessage,
                    });
                }
            }

            if (!field.required) {
                schema = schema.optional();
            }

            acc[field.name] = schema;
            return acc;
        },
        {} as Record<string, z.ZodTypeAny>,
    );

    return z.object(fieldSchemas);
};
