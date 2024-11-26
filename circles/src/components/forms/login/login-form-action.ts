import { FormAction, FormSubmitResponse, Page } from "../../../models/models";
import { AuthenticationError, authenticateUser } from "@/lib/auth/auth";
import { createSession, generateUserToken } from "@/lib/auth/jwt";
import { Circles } from "@/lib/data/db";
import { getUserPrivate } from "@/lib/data/user";

export const loginFormAction: FormAction = {
    id: "login-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        try {
            let email = values.email;
            let password = values.password;

            // get user by email
            let user = await Circles.findOne({ email: email });
            if (!user) {
                throw new AuthenticationError("Account does not exist");
            }

            authenticateUser(user.did!, password);
            let token = await generateUserToken(user.did!);

            createSession(token);

            let privateUser = await getUserPrivate(user.did!);
            return { success: true, message: "User authenticated successfully", data: { user: privateUser } };
        } catch (error) {
            if (error instanceof AuthenticationError) {
                return { success: false, message: error.message };
            } else if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to log in the user. " + JSON.stringify(error) };
            }
        }
    },
};
