// create-circle-form-schema.ts
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
            autoComplete: "one-time-code",
        },
        {
            name: "handle",
            label: "Handle",
            type: "auto-handle",
            placeholder: "circle-handle",
            description: "Your unique identifier for this circle.",
            required: true,
            autoComplete: "one-time-code",
        },
        {
            name: "description",
            label: "Description",
            type: "textarea",
            required: false,
        },
        {
            name: "content",
            label: "Detailed Content",
            type: "textarea",
            required: false,
            description: "For projects, enter detailed information here.",
        },
        {
            name: "location",
            label: "Location",
            type: "location",
            description: "Set the location for your circle.",
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
            description: "Indicates if the Circle is Public. A public circle doesn't require approval to follow.",
            defaultValue: true,
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
