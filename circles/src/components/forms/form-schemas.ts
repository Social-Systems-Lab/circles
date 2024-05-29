import { FormSchema } from "../../models/models";
import { registerFormSchema } from "./register/register-form-schema";

export const formSchemas: Record<string, FormSchema> = {
    "register-form": registerFormSchema,
};
