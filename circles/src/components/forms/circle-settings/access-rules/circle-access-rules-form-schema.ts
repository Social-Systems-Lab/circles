import { FormSchema } from "../../../../models/models";

export const circleAccessRulesFormSchema: FormSchema = {
    id: "circle-access-rules-form",
    title: "Access Rules",
    description:
        "Manage and control which user groups have access to specific features within the circle. Define and enforce permissions to ensure appropriate access for each group.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "name",
            label: "Name",
            type: "text",
            required: true,
        },
        {
            name: "handle",
            label: "Handle",
            type: "handle",
            placeholder: "handle",
            description: "Choose a unique handle that will identify the circle on the platform.",
            required: true,
        },
    ],
};
