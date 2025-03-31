import { FormSchema } from "@/models/models";

export const circleGeneralFormSchema: FormSchema = {
    id: "circle-general-form",
    title: "General Settings",
    description: "Manage general settings for this circle",
    button: {
        text: "Save Changes",
    },
    fields: [
        {
            name: "_id",
            label: "Circle ID",
            type: "hidden",
        },
        {
            name: "dangerZone",
            label: "Danger Zone",
            type: "hidden",
            description: "Actions that can't be undone",
        },
    ],
};
