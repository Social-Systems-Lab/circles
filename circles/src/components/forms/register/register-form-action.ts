import { on } from "events";
import { FormSchema, FormAction, AuthData, FormSubmitResponse } from "../../../models/models";
import { createSession, createUser, generateUserToken } from "@/lib/auth";
import { redirect } from "next/navigation";

export const registerFormAction: FormAction = {
    id: "register-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            console.log("Registering user with values", values);
            let user = await createUser(values.name, values.handle, values.type, values._email, values._password);
            let token = generateUserToken(user.did, user.email);
            createSession(token);
            let authData: AuthData = { type: "auth-data", user, token };

            return { success: true, message: "User registered successfully", data: authData };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to register the user. " + JSON.stringify(error) };
            }
        }
    },
};
