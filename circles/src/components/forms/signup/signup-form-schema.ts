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
        text: "Register",
    },
    fields: [
        {
            name: "type",
            label: "Account Type",
            type: "select",
            options: [
                { value: "user", label: "Personal" },
                { value: "organization", label: "Organization" },
            ],
            required: true,
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
            description:
                "Choose a unique handle that will identify the account on the platform, e.g., a nickname or organization name.",
            required: true,
        },
        {
            name: "_email",
            label: "Email",
            type: "email",
            placeholder: "email",
            autoComplete: "nope",
            required: true,
        },
        {
            name: "_password",
            label: "Password",
            type: "password",
            placeholder: "",
            autoComplete: "new-password",
            required: true,
        },
    ],
};
