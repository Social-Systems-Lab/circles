import { FormSchema } from "../../models/models";
import { signupFormSchema } from "./signup/signup-form-schema";
import { loginFormSchema } from "./login/login-form-schema";
import { circleAboutFormSchema } from "./circle-settings/about/circle-about-form-schema";
import { circleUserGroupsFormSchema } from "./circle-settings/user-groups/circle-user-groups-form-schema";
import { circleAccessRulesFormSchema } from "./circle-settings/access-rules/circle-access-rules-form-schema";
import { circlePagesFormSchema } from "./circle-settings/pages/circle-pages-form-schema";
import { serverSettingsFormSchema } from "./circle-settings/server-settings/server-settings-schema";

export const formSchemas: Record<string, FormSchema> = {
    "signup-form": signupFormSchema,
    "login-form": loginFormSchema,
    "circle-about-form": circleAboutFormSchema,
    "circle-user-groups-form": circleUserGroupsFormSchema,
    "circle-access-rules-form": circleAccessRulesFormSchema,
    "circle-pages-form": circlePagesFormSchema,
    "server-settings-form": serverSettingsFormSchema,
};
