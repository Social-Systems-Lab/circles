import { FormSchema } from "../../../models/models";

export const signupFormSchema: FormSchema = {
    id: "signup-form",
    title: "Sign up",
    description: "Create an account to get started.",
    footer: {
        text: "Already have an account?",
        link: { href: "/login", text: "Log in" },
    },
    button: {
        text: "Sign up",
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
            type: "auto-handle",
            placeholder: "handle",
            description: "Your unique identifier on the platform.",
            required: true,
        },
        {
            name: "_email",
            label: "Email",
            type: "email",
            placeholder: "email",
            autoComplete: "one-time-code",
            required: true,
        },
        {
            name: "_password",
            label: "Password",
            type: "password",
            placeholder: "",
            autoComplete: "one-time-code",
            required: true,
        },
    ],
};
