// form-actions.ts
import { FormAction } from "../../models/models";
import { circleAboutFormAction } from "./circle-settings/about/circle-about-form-action";
import { circleUserGroupsFormAction } from "./circle-settings/user-groups/circle-user-groups-form-action";
import { circleAccessRulesFormAction } from "./circle-settings/access-rules/circle-access-rules-form-action";
import { circlePagesFormAction } from "./circle-settings/pages/circle-pages-form-action";
import { serverSettingsFormAction } from "./circle-settings/server-settings/server-settings-action";
import { circleQuestionnaireFormAction } from "./circle-settings/questionnaire/circle-questionnaire-form-action";
import { createCircleFormAction } from "./create-circle/create-circle-form-action";
import { circleMatchmakingFormAction } from "./circle-settings/matchmaking/circle-matchmaking-form-action";
import { signupFormAction } from "./signup/signup-form-action";
import { loginFormAction } from "./login/login-form-action";

export const formActions: Record<string, FormAction> = {
    "signup-form": signupFormAction,
    "login-form": loginFormAction,
    "circle-about-form": circleAboutFormAction,
    "circle-user-groups-form": circleUserGroupsFormAction,
    "circle-access-rules-form": circleAccessRulesFormAction,
    "circle-pages-form": circlePagesFormAction,
    "circle-questionnaire-form": circleQuestionnaireFormAction,
    "server-settings-form": serverSettingsFormAction,
    "create-circle-form": createCircleFormAction,
    "circle-matchmaking-form": circleMatchmakingFormAction,
};
