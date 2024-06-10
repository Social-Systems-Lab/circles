import { FormAction } from "../../models/models";
import { signupFormAction } from "./signup/signup-form-action";
import { loginFormAction } from "./login/login-form-action";
import { circleAboutFormAction } from "./circle-settings/about/circle-about-form-action";
import { circleUserGroupsFormAction } from "./circle-settings/user-groups/circle-user-groups-form-action";
import { circleAccessRulesFormAction } from "./circle-settings/access-rules/circle-access-rules-form-action";
import { circlePagesFormAction } from "./circle-settings/pages/circle-pages-form-action";

export const formActions: Record<string, FormAction> = {
    "signup-form": signupFormAction,
    "login-form": loginFormAction,
    "circle-about-form": circleAboutFormAction,
    "circle-user-groups-form": circleUserGroupsFormAction,
    "circle-access-rules-form": circleAccessRulesFormAction,
    "circle-pages-form": circlePagesFormAction,
};
