// actions.ts
"use server";

import { createSession, generateUserToken, verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate } from "@/lib/data/user";
import { Account, Challenge, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createUserAccount, getChallenge, getDid, issueChallenge, verifyChallengeSignature } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

type CreateAccountResponse = {
    privateKey: string;
    user: UserPrivate;
};
export const createAccountAction = async (displayName: string): Promise<CreateAccountResponse> => {
    // create a new account
    let account = await createUserAccount(displayName);
    let response: CreateAccountResponse = {
        privateKey: account.privateKey,
        user: account.user,
    };

    // create token and session for user
    let token = await generateUserToken(account.user.did!);
    await createSession(token);

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
    let token = await generateUserToken(user.did!);
    await createSession(token);

    return { user, authenticated: true };
}

export async function checkAuth(account: Account | undefined): Promise<CheckAuthResponse> {
    try {
        const token = (await cookies()).get("token")?.value;
        if (token) {
            let payload = await verifyUserToken(token);
            if (payload) {
                console.log("User is authenticated", payload.userDid);

                // user is authenticated
                let user = await getUserPrivate(payload.userDid as string);
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

export async function verifySignatureAction(
    publicKey: string,
    signature: string,
    challengeStr: string,
): Promise<boolean> {
    console.log("Trying to verify signature, pk: ", publicKey, ", signature: ", signature);
    return await verifyChallengeSignature(publicKey, signature, challengeStr);
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
    let token = await generateUserToken(account.user.did!);
    await createSession(token);

    let response: CreateAccountResponse = {
        privateKey: account.privateKey,
        user: account.user,
    };
    return response;
}
