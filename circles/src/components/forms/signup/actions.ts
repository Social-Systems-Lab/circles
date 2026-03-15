"use server";

import { FormSubmitResponse, UserPrivate } from "../../../models/models";
import { AuthenticationError, createUserSession, createUserAccount } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";

export const submitSignupFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    try {
        const normalizedHandle = String(values.handle || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/_/g, "-");
        const normalizedEmail = String(values._email || "").trim().toLowerCase();
        const derivedName =
            String(values.name || "").trim() ||
            normalizedHandle
                .split("-")
                .filter(Boolean)
                .join(" ") ||
            normalizedEmail.split("@")[0];

        const signupType = values.type === "organization" ? "organization" : "user";
        const requestedSkills = Array.isArray(values.skills)
            ? values.skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0)
            : undefined;
        const requestedInterests = Array.isArray(values.interests)
            ? values.interests.filter(
                  (interest): interest is string => typeof interest === "string" && interest.trim().length > 0,
              )
            : undefined;
        const requestedMetadata =
            values.metadata && typeof values.metadata === "object" && !Array.isArray(values.metadata)
                ? values.metadata
                : undefined;

        let user = await createUserAccount(
            derivedName,
            normalizedHandle,
            signupType,
            normalizedEmail,
            values._password,
        );
        await createUserSession(user as UserPrivate, user.did!);

        if (requestedSkills?.length || requestedInterests?.length || requestedMetadata) {
            await updateCircle(
                {
                    _id: user._id!,
                    skills: requestedSkills,
                    interests: requestedInterests,
                    offers: requestedSkills?.length
                        ? {
                              ...(user.offers ?? {}),
                              skills: requestedSkills,
                              visibility: user.offers?.visibility ?? "public",
                          }
                        : user.offers,
                    metadata: requestedMetadata ? { ...(user.metadata ?? {}), ...requestedMetadata } : user.metadata,
                },
                user.did!,
            );
        }

        try {
            const resolvedWelcome = await getResolvedWelcomeTemplate();
            await ensureWelcomeMessageForNewUser(user.did!, resolvedWelcome.config, resolvedWelcome.senderDid);
        } catch (error) {
            console.error("Failed to create signup welcome message:", error);
        }

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
