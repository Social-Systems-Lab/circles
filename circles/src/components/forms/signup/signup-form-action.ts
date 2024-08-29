import { FormAction, FormSubmitResponse } from "../../../models/models";
import { AuthenticationError, createUser, getUserPublicKey } from "@/lib/auth/auth";
import { createSession, generateUserToken } from "@/lib/auth/jwt";
import { getServerSettings } from "@/lib/data/server-settings";
import { getUserPrivate, registerUser, updateUser } from "@/lib/data/user";

export const signupFormAction: FormAction = {
    id: "signup-form",
    onSubmit: async (values: Record<string, any>): Promise<FormSubmitResponse> => {
        try {
            //console.log("Signing up user with values", values);
            let user = await createUser(values.name, values.handle, values.type, values._email, values._password);
            let token = await generateUserToken(user.did, user.email);
            createSession(token);

            // register user in the circles registry
            let currentServerSettings = await getServerSettings();

            if (currentServerSettings.registryUrl) {
                // register user
                try {
                    // get public key for user
                    let publicKey = getUserPublicKey(user.did);

                    let registryInfo = await registerUser(
                        user.did!,
                        user.name!,
                        user.email!,
                        values._password,
                        user.handle!,
                        user.type!,
                        currentServerSettings.did!,
                        currentServerSettings.registryUrl,
                        publicKey,
                        user.picture?.url,
                    );

                    // update user with registry info
                    await updateUser({ _id: user._id, activeRegistryInfo: registryInfo });
                } catch (error) {
                    console.log("Failed to register user with registry", error);
                }
            }

            let privateUser = getUserPrivate(user.did);
            return { success: true, message: "User signed up successfully", data: { user: privateUser } };
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
