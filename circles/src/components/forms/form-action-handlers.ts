import { FormActionHandler, FormSchema } from "../../models/models";
import { registerFormActionHandler } from "./register/register-form-action-handler";

export const formActionHandlers: Record<string, FormActionHandler> = {
    "register-form": registerFormActionHandler,
};
