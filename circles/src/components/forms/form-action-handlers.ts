import { FormActionHandler, FormSchema } from "../../models/models";
import { circleSettingsFormActionHandler } from "./circle-settings/circle-settings-form-action-handler";
import { loginFormActionHandler } from "./login/login-form-action-handler";
import { signupFormActionHandler } from "./signup/signup-form-action-handler";

export const formActionHandlers: Record<string, FormActionHandler> = {
    "signup-form": signupFormActionHandler,
    "login-form": loginFormActionHandler,
    "circle-settings-form": circleSettingsFormActionHandler,
};
