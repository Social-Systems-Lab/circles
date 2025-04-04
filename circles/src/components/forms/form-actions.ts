// form-actions.ts
import { FormAction } from "../../models/models";
import { serverSettingsFormAction } from "./circle-settings/server-settings/server-settings-action";
import { createCircleFormAction } from "./create-circle/create-circle-form-action";
import { signupFormAction } from "./signup/signup-form-action";
import { loginFormAction } from "./login/login-form-action";
import { circleGeneralFormAction } from "./circle-settings/general/circle-general-form-action";

export const formActions: Record<string, FormAction> = {
    "signup-form": signupFormAction,
    "login-form": loginFormAction,
    "server-settings-form": serverSettingsFormAction,
    "create-circle-form": createCircleFormAction,
    "circle-general-form": circleGeneralFormAction,
};
