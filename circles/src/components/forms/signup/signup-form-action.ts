import { FormAction, AuthData, FormSubmitResponse } from "../../../models/models";
import { AuthenticationError, createUser } from "@/lib/auth/auth";
import { createSession, generateUserToken } from "@/lib/auth/jwt";

export const signupFormAction: FormAction = {
    id: "signup-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            console.log("Signing up user with values", values);
            let user = await createUser(values.name, values.handle, values.type, values._email, values._password);
            let token = await generateUserToken(user.did, user.email);
            createSession(token);
            return { success: true, message: "User signed up successfully", data: { user } };
        } catch (error) {
            if (error instanceof AuthenticationError) {
                return { success: false, message: error.message };
            } else if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to sign up the user. " + JSON.stringify(error) };
            }
        }
    },
};
