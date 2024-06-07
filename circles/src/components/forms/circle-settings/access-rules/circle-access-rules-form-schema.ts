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
            name: "_id",
            type: "hidden",
            label: "ID",
        },
        {
            name: "accessRules",
            label: "Access Rules",
            type: "access-rules",
            required: true,
        },
    ],
};
