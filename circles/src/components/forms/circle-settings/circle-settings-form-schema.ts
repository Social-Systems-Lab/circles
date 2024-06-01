import { FormSchema } from "../../../models/models";

export const circleSettingsFormSchema: FormSchema = {
    id: "circle-settings-form",
    title: "Settings",
    description: "Configure the circle.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "email",
            label: "Email",
            type: "email",
            placeholder: "email",
            required: true,
        },
        {
            name: "password",
            label: "Password",
            type: "password",
            placeholder: "",
            required: true,
        },
    ],
};
