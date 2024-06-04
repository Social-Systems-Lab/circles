import { FormSchema } from "../../../../models/models";

export const circleSettingsFormSchema: FormSchema = {
    id: "circle-about-form",
    title: "About",
    description: "Circle name and handle.",
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
