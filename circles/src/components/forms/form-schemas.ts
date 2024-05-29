import { FormSchema } from "../../models/models";
import { loginFormSchema } from "./login/login-form-schema";
import { signupFormSchema } from "./signup/signup-form-schema";

export const formSchemas: Record<string, FormSchema> = {
    "signup-form": signupFormSchema,
    "login-form": loginFormSchema,
};
