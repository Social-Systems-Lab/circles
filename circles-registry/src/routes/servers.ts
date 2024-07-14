import { Hono } from "hono";
import { Context, Next } from "hono";
import { z } from "zod";
import { serverRegistrationConfirmSchema, serverRegistrationRequestSchema } from "../data/models";
import { ServerChallenges, Servers } from "../data/db";
const crypto = require("crypto");

const servers = new Hono();

servers.post("/register", async (c: Context) => {
    try {
        const body = await c.req.json();
        const validatedData = serverRegistrationRequestSchema.parse(body);

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

        await ServerChallenges.insertOne({
            name: validatedData.name,
            did: validatedData.did,
            url: validatedData.url,
            publicKey: validatedData.publicKey,
            challenge,
            expiresAt,
        });

        return c.json({ success: true, challenge });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ success: false, message: "Invalid request data", errors: error.errors }, 400);
        }
        console.error("Error in server registration:", error);
        return c.json({ success: false, message: "Internal server error" }, 500);
    }
});

servers.post("/register-confirm", async (c: Context) => {
    try {
        const body = await c.req.json();
        const validatedData = serverRegistrationConfirmSchema.parse(body);

        // retrieve the challenge
        const challengeDoc = await ServerChallenges.findOne({ did: validatedData.did, challenge: validatedData.challenge });
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

        const existingServer = await Servers.findOne({ did: validatedData.did });
        if (existingServer) {
            // update server as registered
            await Servers.updateOne(
                { did: validatedData.did },
                {
                    $set: {
                        did: validatedData.did,
                        name: challengeDoc.name,
                        url: challengeDoc.url,
                        publicKey: challengeDoc.publicKey,
                        updatedAt: new Date(),
                    },
                }
            );
        } else {
            // create new server
            await Servers.insertOne({
                did: validatedData.did,
                name: challengeDoc.name,
                url: challengeDoc.url,
                publicKey: challengeDoc.publicKey,
                registeredAt: new Date(),
            });
        }

        // remove the used challenge
        await ServerChallenges.deleteOne({ did: validatedData.did });

        return c.json({ success: true, message: "Server registered successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ success: false, message: "Invalid request data", errors: error.errors }, 400);
        }
        console.error("Error in server registration confirmation:", error);
        return c.json({ success: false, message: "Internal server error" }, 500);
    }
});

export default servers;
