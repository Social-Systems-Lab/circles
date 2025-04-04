import { FormSchema } from "../../models/models";
import { serverSettingsFormSchema } from "./circle-settings/server-settings/server-settings-schema";
import { createCircleFormSchema } from "./create-circle/create-circle-form-schema";
import { signupFormSchema } from "./signup/signup-form-schema";
import { loginFormSchema } from "./login/login-form-schema";
import { circleGeneralFormSchema } from "./circle-settings/general/circle-general-form-schema";

export const formSchemas: Record<string, FormSchema> = {
    "signup-form": signupFormSchema,
    "login-form": loginFormSchema,
    "server-settings-form": serverSettingsFormSchema,
    "create-circle-form": createCircleFormSchema,
    "circle-general-form": circleGeneralFormSchema,
};
