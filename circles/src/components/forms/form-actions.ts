import { FormAction } from "../../models/models";
import { registerFormAction } from "./register/register-form-action";

export const formActions: Record<string, FormAction> = {
    "register-form": registerFormAction,
};
