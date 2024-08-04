import { FormSchema } from "@/models/models";

export const createCircleFormSchema: FormSchema = {
    id: "create-circle-form",
    title: "Create New Circle",
    description: "Specify the details for your new circle.",
    button: {
        text: "Create Circle",
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
            placeholder: "circle-handle",
            description: "Choose a unique handle for your circle.",
            required: true,
        },
        {
            name: "description",
            label: "Description",
            type: "textarea",
            required: false,
        },
        {
            name: "picture",
            label: "Picture",
            type: "image",
            description: "Upload a picture for your circle.",
        },
        {
            name: "cover",
            label: "Cover Image",
            type: "image",
            description: "Upload a cover image for your circle.",
        },
        {
            name: "isPublic",
            label: "Public",
            type: "switch",
            description: "Indicates if the Circle is Public. A public circle doesn't require approval to join.",
        },
        {
            name: "parentCircleId",
            label: "Parent Circle",
            type: "hidden",
            description: "The parent circle for this circle.",
            required: true,
        },
    ],
};
