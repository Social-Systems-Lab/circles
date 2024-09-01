import { FormSchema } from "../../../models/models";

export const loginFormSchema: FormSchema = {
    id: "login-form",
    title: "Login",
    description: "Enter your email and password to log in.",
    footer: {
        text: "Don't have an account?",
        link: { href: "/signup", text: "Sign up here" },
    },
    button: {
        text: "Log in",
    },
    fields: [
        {
            name: "email",
            label: "Email",
            type: "email",
            placeholder: "email",
            required: true,
            autoComplete: "on",
        },
        {
            name: "password",
            label: "Password",
            type: "password",
            placeholder: "",
            required: true,
            autoComplete: "on",
        },
    ],
};
