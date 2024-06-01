import { FormAction } from "../../models/models";
import { circleSettingsFormAction } from "./circle-settings/circle-settings-form-action";
import { loginFormAction } from "./login/login-form-action";
import { signupFormAction } from "./signup/signup-form-action";

export const formActions: Record<string, FormAction> = {
    "signup-form": signupFormAction,
    "login-form": loginFormAction,
    "circle-settings-form": circleSettingsFormAction,
};
