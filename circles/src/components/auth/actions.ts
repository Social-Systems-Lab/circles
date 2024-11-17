// actions.ts
"use server";

import { createSession, generateUserToken, verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate } from "@/lib/data/user";
import { Account, Challenge, Circle, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import crypto from "crypto";
import { isValid } from "zod";
import { getDefaultCircle } from "@/lib/data/circle";
import { addMember } from "@/lib/data/member";
import { createUser, createUserAccount, createUserOld, getChallenge, getDid, issueChallenge } from "@/lib/auth/auth";

type CreateAccountResponse = {
    privateKey: string;
    user: UserPrivate;
};
export const createAccount = async (displayName: string): Promise<CreateAccountResponse> => {
    // create a new account
    let account = await createUserAccount(displayName);

    // TODO sign the user in with the new account immediatelly?

    return account;
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

type VerifySignatureResponse = {
    user?: UserPrivate;
    authenticated: boolean;
    message?: string;
};

export async function verifySignature(
    publicKey: string,
    signature: string,
    userData: Circle | undefined,
): Promise<VerifySignatureResponse> {
    // retrieve the challenge from the database
    let challenge = await getChallenge(publicKey);
    if (!challenge) {
        return { user: undefined, authenticated: false, message: "Challenge not found" };
    }

    // verify the signature
    const verify = crypto.createVerify("SHA256");
    verify.update(challenge.challenge);
    const isValidSignature = verify.verify(publicKey, signature, "base64");

    if (!isValidSignature) {
        return { user: undefined, authenticated: false, message: "Invalid signature" };
    }

    // get the DID from the public key and return user data
    let did = getDid(publicKey);
    let user = await getUserPrivate(did);
    if (user) {
        return { user, authenticated: true };
    }

    // create a new user
    let newUser = await createUser(did, publicKey); // TODO include name, picture, etc.
    let token = await generateUserToken(did);
    createSession(token);

    // add user to default circle by default
    let defaultCircle = await getDefaultCircle();
    if (defaultCircle._id) {
        await addMember(newUser.did!, defaultCircle._id, ["members"]);
    }

    let privateUser = await getUserPrivate(did);
    return { user: privateUser, authenticated: true };
}

export async function logOut(): Promise<void> {
    // clear session
    (await cookies()).set("token", "", { maxAge: 0 });
}
