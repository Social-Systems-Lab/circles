import { FormSchema } from "../../../../models/models";

export const circleAboutFormSchema: FormSchema = {
    id: "circle-about-form",
    title: "About",
    description: "Manage and personalize the circle.",
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
        {
            name: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Description",
            description: "Describe the circle in a few words.",
            minLength: 10,
            maxLength: 200,
        },
        {
            name: "picture",
            label: "Picture",
            type: "image",
            description: "Add a picture to represent your circle.",
        },
        {
            name: "cover",
            label: "Cover",
            type: "image-list",
            description: "Add cover images to represent your circle.",
        },
    ],
};
