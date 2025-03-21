import { FormSchema } from "../../../../models/models";

export const circleAboutFormSchema: FormSchema = {
    id: "circle-about-form",
    title: "About",
    description: { circle: "Manage and personalize the circle.", user: "Manage and personalize your profile." },
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
            description: {
                circle: "Choose a unique handle that will identify the circle on the platform.",
                user: "Choose a unique handle that will identify you on the platform.",
            },
            required: true,
        },
        {
            name: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Description",
            description: { circle: "Describe the circle in a few words.", user: "Describe yourself in a few words." },
            maxLength: 200,
        },
        {
            name: "mission",
            label: { user: "Your Mission", circle: "Mission" },
            type: "textarea",
            placeholder: "Description",
            description: {
                circle: "Define the circle's purpose and the change it wants to see in the world.",
                user: "Define your purpose and the change you want to see in the world.",
            },
            maxLength: 500,
        },
        {
            name: "picture",
            label: "Picture",
            type: "image",
            description: { circle: "Add a picture to represent the circle.", user: "Add a profile picture." },
        },
        {
            name: "cover",
            label: "Cover",
            type: "image",
            description: {
                circle: "Add cover image to decorate the circle.",
                user: "Add a cover image to decorate your profile.",
            },
        },
        {
            name: "isPublic",
            label: "Public",
            type: "switch",
            description: {
                circle: "When set to public, users can follow the circle without requiring approval from admins.",
                user: "When set to public people can follow you without requiring your approval.",
            },
        },
        {
            name: "location",
            label: "Location",
            type: "location",
            description: {
                circle: "Specify the location of the circle.",
                user: "Specify your location. Your location will be shared with other users.",
            },
        },
    ],
};
