import { FormActionHandler, FormSchema } from "../../models/models";
import { loginFormActionHandler } from "./login/login-form-action-handler";
import { signupFormActionHandler } from "./signup/signup-form-action-handler";
import { circleAboutFormActionHandler } from "./circle-settings/about/circle-about-form-action-handler";
import { circleUserGroupsFormActionHandler } from "./circle-settings/user-groups/circle-user-groups-form-action-handler";
import { circleAccessRulesFormActionHandler } from "./circle-settings/access-rules/circle-access-rules-form-action-handler";
import { circlePagesFormActionHandler } from "./circle-settings/pages/circle-pages-form-action-handler";
import { serverSettingsFormActionHandler } from "./circle-settings/server-settings/server-settings-action-handler";
import { circleQuestionnaireFormActionHandler } from "./circle-settings/questionnaire/circle-questionnaire-action-handler";
import { createCircleFormActionHandler } from "./create-circle/create-circle-form-action-handler";
import { circleMatchmakingFormActionHandler } from "./circle-settings/matchmaking/circle-matchmaking-action-handler";

export const formActionHandlers: Record<string, FormActionHandler> = {
    "signup-form": signupFormActionHandler,
    "login-form": loginFormActionHandler,
    "circle-about-form": circleAboutFormActionHandler,
    "circle-user-groups-form": circleUserGroupsFormActionHandler,
    "circle-access-rules-form": circleAccessRulesFormActionHandler,
    "circle-pages-form": circlePagesFormActionHandler,
    "circle-questionnaire-form": circleQuestionnaireFormActionHandler,
    "server-settings-form": serverSettingsFormActionHandler,
    "create-circle-form": createCircleFormActionHandler,
    "circle-matchmaking-form": circleMatchmakingFormActionHandler,
};
