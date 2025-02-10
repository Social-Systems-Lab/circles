// actions.ts
"use server";

import { createSession, generateUserToken, verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate, updateUser } from "@/lib/data/user";
import { Account, Challenge, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import crypto from "crypto";
import {
    createUserAccount,
    createUserFromAccount,
    createUserSession,
    getChallenge,
    getDid,
    issueChallenge,
    verifyChallengeSignature,
} from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";
import { registerOrLoginMatrixUser } from "@/lib/data/matrix";
import { updateCircle } from "@/lib/data/circle";

type CreateAccountResponse = {
    privateKey: string;
    user: UserPrivate;
};
export const createAccountAction = async (displayName: string): Promise<CreateAccountResponse> => {
    // create a new account
    let account = await createUserAccount(displayName);

    // create token and session for user
    await createUserSession(account.user);

    let response: CreateAccountResponse = {
        privateKey: account.privateKey,
        user: account.user,
    };
    return response;
};

type CheckAuthResponse = {
    user?: UserPrivate;
    authenticated: boolean;
    challenge?: Challenge;
};

export async function checkExternalAuth(challenge: Challenge): Promise<CheckAuthResponse> {
    console.log("Checking external auth", challenge);

    let response = await getChallenge(challenge.challenge);
    if (!response?.verified) return { authenticated: false };

    // get user did from public key
    let publicKey = response.publicKey;
    if (!publicKey) return { authenticated: false };

    let did = getDid(publicKey);
    let user = await getUserPrivate(did);
    if (!user) return { authenticated: false };

    // create token and session for user
    await createUserSession(user);
    return { user, authenticated: true };
}

export async function checkAuth(account: Account | undefined): Promise<CheckAuthResponse> {
    const token = (await cookies()).get("token")?.value;

    try {
        if (token) {
            let payload = await verifyUserToken(token);
            if (payload) {
                // user is authenticated
                let user = await getUserPrivate(payload.userDid as string);

                if (!user.matrixAccessToken) {
                    try {
                        // check if user has a matrix account
                        await registerOrLoginMatrixUser(user);
                    } catch (error) {
                        console.error("Error creating matrix session", error);
                    }
                }

                return { user, authenticated: true };
            }
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    // no token, issue a signing challenge to get a new token
    let publicKey = account?.publicKey;
    if (publicKey) {
        // issue a challenge for the public key
        console.log("Issuing challenge for public key", publicKey);
        let challenge = await issueChallenge(publicKey);
        return { user: undefined, authenticated: false, challenge };
    } else {
        // issue challenge for the unauthenticated user
        console.log("Issuing challenge for unauthenticated user");
        let challenge = await issueChallenge();
        return { user: undefined, authenticated: false, challenge };
    }
}

type VerifySignatureResponse = {
    verified: boolean;
    user?: UserPrivate;
};
export async function verifySignatureAction(
    publicKey: string,
    signature: string,
    challengeStr: string,
    currentAccount: Account | undefined,
): Promise<VerifySignatureResponse> {
    console.log("Trying to verify signature, pk: ", publicKey, ", signature: ", signature);
    let res = await verifyChallengeSignature(publicKey, signature, challengeStr);
    if (!res) return { verified: false };

    // create account if it doesn't exist
    if (!currentAccount) {
        // verifying an external sign in attempt, meaning we don't want to sign in the user here
        return { verified: res };
    }

    // current account specified meaning we are verifying the current account and want to sign in
    try {
        let did = getDid(publicKey);
        let user = await getUserPrivate(did);
        if (!user) {
            user = await createUserFromAccount(currentAccount);
        }

        // create token and session for user
        await createUserSession(user);
        return { verified: res, user };
    } catch (error) {
        console.error("Error creating account", error);
    }
    return { verified: res };
}

export async function logOut(): Promise<void> {
    // clear session
    (await cookies()).set("token", "", { maxAge: 0 });

    // clear cache
    revalidatePath(`/`);
}

export async function createTestAccountAction(): Promise<CreateAccountResponse> {
    // create a new account
    let account = await createUserAccount("Test Account");
    await createUserSession(account.user);

    let response: CreateAccountResponse = {
        privateKey: account.privateKey,
        user: account.user,
    };
    return response;
}
