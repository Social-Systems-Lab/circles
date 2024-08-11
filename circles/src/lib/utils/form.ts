import {
    FormField,
    FormSchema,
    accessRulesSchema,
    emailSchema,
    getImageSchema,
    handleSchema,
    passwordSchema,
} from "@/models/models";
import { z, ZodIssue, ZodSchema, ZodString } from "zod";

export const getFormValues = (formData: FormData, formSchema: FormSchema): Record<string, any> => {
    const values: Record<string, any> = {};

    for (const [key, value] of formData.entries() as any) {
        // if key is an array object we parse the json to get the value
        let fieldInfo = formSchema.fields.find((x) => x.name === key);
        if (fieldInfo?.type === "array" || fieldInfo?.type === "table" || fieldInfo?.type === "access-rules") {
            values[key] = JSON.parse(value);
            continue;
        } else if (fieldInfo?.type === "switch") {
            values[key] = value === "true";
            continue;
        }
        values[key] = value;
    }

    return values;
};

const formatZodIssue = (issue: ZodIssue): string => {
    const { path, message } = issue;
    const pathString = path.join(".");
    return `${pathString}: ${message}`;
};

export const formatZodError = (error: z.ZodError): string => {
    const { issues } = error;
    if (issues.length) {
        const currentIssue = issues[0];
        return formatZodIssue(currentIssue);
    }
    return "";
};

export const generateZodSchema = (fields: FormField[]): ZodSchema<any> => {
    const fieldSchemas = fields.reduce(
        (acc, field) => {
            let schema: z.ZodTypeAny;

            switch (field.type) {
                case "switch":
                    schema = z.boolean();
                    break;

                case "access-rules":
                    schema = accessRulesSchema;
                    break;

                case "table":
                case "array":
                    schema = z.array(generateZodSchema(field.itemSchema?.fields || []));

                    let ensureUniqueField = field.ensureUniqueField ?? false;
                    if (ensureUniqueField) {
                        schema = schema.superRefine((items, ctx) => {
                            //console.log("Refining array", items, ensureUniqueField);
                            let uniqueValues = new Set();
                            let index = 0;
                            for (let item of items) {
                                let value = item[ensureUniqueField];
                                if (uniqueValues.has(value)) {
                                    ctx.addIssue({
                                        code: z.ZodIssueCode.custom,
                                        message: `Found duplicate value '${value}'. Please ensure each ${ensureUniqueField} is unique.`,
                                        path: [index, ensureUniqueField],
                                    });
                                    return;
                                }
                                uniqueValues.add(value);
                                ++index;
                            }
                        });
                    }
                    break;

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

                case "number":
                    schema = z.number();
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
