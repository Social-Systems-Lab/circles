import { Hono } from "hono";
import { Context, Next } from "hono";
import { z } from "zod";
import { User, userRegistrationConfirmSchema, userRegistrationRequestSchema } from "../data/models";
import { UserChallenges, Users } from "../data/db";
const crypto = require("crypto");

const users = new Hono();

users.post("/register", async (c: Context) => {
    try {
        const body = await c.req.json();
        const validatedData = userRegistrationRequestSchema.parse(body);

        // generate a challenge
        const challenge = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Challenge expires in 5 minutes

        // make sure the DID matches the public key
        let publicKey = validatedData.publicKey;
        let did = validatedData.did;
        const hashedPublicKey = crypto.createHash("sha256").update(publicKey).digest("hex");
        if (did !== hashedPublicKey) {
            return c.json({ success: false, message: "DID does not match public key" }, 400);
        }

        await UserChallenges.insertOne({
            name: validatedData.name,
            email: validatedData.email,
            handle: validatedData.handle,
            type: validatedData.type,
            picture: validatedData.picture,
            did: validatedData.did,
            homeServerDid: validatedData.homeServerDid,
            serverDid: validatedData.serverDid,
            publicKey: validatedData.publicKey,
            challenge,
            expiresAt,
        });

        return c.json({ success: true, challenge });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ success: false, message: "Invalid request data", errors: error.errors }, 400);
        }
        console.error("Error in user registration:", error);
        return c.json({ success: false, message: "Internal server error" }, 500);
    }
});

users.post("/register-confirm", async (c: Context) => {
    try {
        const body = await c.req.json();
        const validatedData = userRegistrationConfirmSchema.parse(body);

        // retrieve the challenge
        const challengeDoc = await UserChallenges.findOne({ did: validatedData.did, challenge: validatedData.challenge });
        if (!challengeDoc) {
            return c.json({ success: false, message: "Invalid challenge" }, 400);
        }

        if (challengeDoc.expiresAt < new Date()) {
            return c.json({ success: false, message: "Expired challenge" }, 400);
        }

        // verify the signature
        const verify = crypto.createVerify("SHA256");
        verify.update(challengeDoc.challenge);
        const isValidSignature = verify.verify(challengeDoc.publicKey, validatedData.signature, "base64");

        if (!isValidSignature) {
            return c.json({ success: false, message: "Invalid signature" }, 400);
        }

        // see if user exists
        const existingUser = await Users.findOne({ did: validatedData.did });
        let updatedUser: User = {
            did: validatedData.did,
            name: challengeDoc.name,
            email: challengeDoc.email,
            handle: challengeDoc.handle,
            type: challengeDoc.type,
            picture: challengeDoc.picture,
            publicKey: challengeDoc.publicKey,
        };

        if (existingUser) {
            updatedUser.updatedAt = new Date();
            if (challengeDoc.serverDid) {
                if (!existingUser.serverDids?.includes(challengeDoc.serverDid)) {
                    if (existingUser.serverDids) {
                        updatedUser.serverDids = [...existingUser.serverDids, challengeDoc.serverDid];
                    } else {
                        updatedUser.serverDids = [challengeDoc.serverDid];
                    }
                }
            }
        } else {
            updatedUser.registeredAt = new Date();
            if (challengeDoc.serverDid) {
                updatedUser.serverDids = [challengeDoc.serverDid];
            }
        }

        if (challengeDoc.homeServerDid) {
            updatedUser.homeServerDid = challengeDoc.homeServerDid;
        }

        // update user as registered
        if (existingUser) {
            await Users.updateOne(
                { did: validatedData.did },
                {
                    $set: updatedUser,
                }
            );
        } else {
            await Users.insertOne(updatedUser);
        }

        // remove the used challenge
        await UserChallenges.deleteOne({ did: validatedData.did });

        return c.json({ success: true, message: "User registered successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ success: false, message: "Invalid request data", errors: error.errors }, 400);
        }
        console.error("Error in user registration confirmation:", error);
        return c.json({ success: false, message: "Internal server error" }, 500);
    }
});

export default users;
