import { FormActionHandler } from "../../models/models";
import { serverSettingsFormActionHandler } from "./circle-settings/server-settings/server-settings-action-handler";
import { createCircleFormActionHandler } from "./create-circle/create-circle-form-action-handler";
import { signupFormActionHandler } from "./signup/signup-form-action-handler";
import { loginFormActionHandler } from "./login/login-form-action-handler";

export const formActionHandlers: Record<string, FormActionHandler> = {
    "signup-form": signupFormActionHandler,
    "login-form": loginFormActionHandler,
    "server-settings-form": serverSettingsFormActionHandler,
    "create-circle-form": createCircleFormActionHandler,
};
