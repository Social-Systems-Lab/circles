"use server";

import { FormSubmitResponse, UserPrivate } from "../../../models/models";
import { AuthenticationError, createUserSession, createUserTrad } from "@/lib/auth/auth";
import { getUserPrivate, registerUser, updateUser } from "@/lib/data/user";

export const submitSignupFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    try {
        //console.log("Signing up user with values", values);
        let user = await createUserTrad(values.name, values.handle, values.type, values._email, values._password);
        await createUserSession(user as UserPrivate);

        // register user in the circles registry
        //let currentServerSettings = await getServerSettings();

        // if (currentServerSettings.registryUrl) {
        //     // register user
        //     try {
        //         // get public key for user
        //         let publicKey = getUserPublicKey(user.did!);

        //         let registryInfo = await registerUser(
        //             user.did!,
        //             user.name!,
        //             user.email!,
        //             values._password,
        //             user.handle!,
        //             user.type!,
        //             currentServerSettings.did!,
        //             currentServerSettings.registryUrl,
        //             publicKey,
        //             user.picture?.url,
        //         );

        //         // update user with registry info
        //         //await updateUser({ _id: user._id, activeRegistryInfo: registryInfo });
        //     } catch (error) {
        //         console.log("Failed to register user with registry", error);
        //     }
        // }

        let privateUser = await getUserPrivate(user.did!);
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
};
