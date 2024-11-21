"use server";

// actions.ts

import { createSession, generateUserToken, verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate } from "@/lib/data/user";
import { Account, Challenge, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createUserAccount, getChallenge, issueChallenge } from "@/lib/auth/auth";

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
    }

    return { user: undefined, authenticated: false };
}

export async function verifySignatureAction(publicKey: string, signature: string): Promise<boolean> {
    console.log("Trying to verify signature", publicKey, signature);

    // retrieve the challenge from the database
    let challenge = await getChallenge(publicKey);
    if (!challenge) {
        console.log("Challenge not found");
        return false;
    }

    // verify the signature
    const verify = crypto.createVerify("SHA256");
    verify.update(challenge.challenge);
    const isValidSignature = verify.verify(publicKey, signature, "base64");

    if (!isValidSignature) {
        console.log("Invalid signature");
        return false;
    }

    return true;
}

export async function logOut(): Promise<void> {
    // clear session
    (await cookies()).set("token", "", { maxAge: 0 });
}
