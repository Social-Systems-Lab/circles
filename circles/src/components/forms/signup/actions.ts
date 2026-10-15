"use server";

import { FormSubmitResponse, UserPrivate } from "../../../models/models";
import { AuthenticationError, createUserSession, createUserAccount } from "@/lib/auth/auth";
import { updateCircle } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";
import { verifyAltchaPayload } from "@/lib/auth/altcha";
import { toAuthenticatedClientUser } from "@/lib/data/client-user-dto";
import { headers } from "next/headers";
import { Circles } from "@/lib/data/db";
import {
    consumeSignupRateLimits,
    normalizeEmailForComparison,
    SignupRejectedError,
    guardPilotSignup,
    withSignupEmailReservation,
} from "@/lib/auth/signup-security";

const GENERIC_SIGNUP_REJECTION = "We couldn't complete your signup. Please check your details and try again later.";

async function comparisonEmailAlreadyExists(email: string): Promise<boolean> {
    const comparisonEmail = normalizeEmailForComparison(email);
    const candidates = comparisonEmail.endsWith("@gmail.com")
        ? await Circles.find({ email: { $regex: "@(gmail\\.com|googlemail\\.com)$", $options: "i" } })
              .project<{ email?: string }>({ email: 1 })
              .toArray()
        : await Circles.find({ email }, { collation: { locale: "en", strength: 2 } })
              .project<{ email?: string }>({ email: 1 })
              .toArray();
    return candidates.some(
        (candidate) =>
            typeof candidate.email === "string" && normalizeEmailForComparison(candidate.email) === comparisonEmail,
    );
}

export const submitSignupFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    try {
        const requestHeaders = await headers();
        // Production prerequisite: nginx must overwrite/set X-Real-IP; never trust X-Forwarded-For here.
        const clientIp = requestHeaders.get("x-real-ip")?.trim() || "missing-x-real-ip";
        const input = await guardPilotSignup(values, clientIp, {
            verifyAltcha: verifyAltchaPayload,
            consumeLimits: consumeSignupRateLimits,
        });
        if (await comparisonEmailAlreadyExists(input._email)) throw new SignupRejectedError();

        return await withSignupEmailReservation(input._email, async () => {
            let user = await createUserAccount(input.name, input.handle, "user", input._email, input._password);
            await createUserSession(user as UserPrivate, user.did!);

            await updateCircle(
                {
                    _id: user._id!,
                    isHuman: true,
                    metadata: { ...(user.metadata ?? {}), onboardingFlow: input.onboardingFlow },
                },
                user.did!,
            );
            user.isHuman = true;

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
            return {
                success: true,
                message: "User signed up successfully",
                data: {
                    user: toAuthenticatedClientUser(privateUser),
                    devVerificationToken:
                        process.env.NODE_ENV !== "production" ? (user.devVerificationToken ?? null) : null,
                    devVerificationUrl:
                        process.env.NODE_ENV !== "production" ? (user.devVerificationUrl ?? null) : null,
                },
            };
        });
    } catch (error) {
        if (error instanceof SignupRejectedError) {
            return { success: false, message: GENERIC_SIGNUP_REJECTION };
        } else if (error instanceof AuthenticationError) {
            return { success: false, message: error.message };
        } else if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to sign up the user. " + JSON.stringify(error) };
        }
    }
};
