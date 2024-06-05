import { FormSchema } from "../../../../models/models";

export const circleAboutFormSchema: FormSchema = {
    id: "circle-about-form",
    title: "About",
    description: "Manage and personalize your circle's identity.",
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
