import { Hono } from "hono";
import { Context, Next } from "hono";
import { z } from "zod";
import { registrationConfirmSchema, registrationRequestSchema } from "../data/models";
import { Challenges, Servers } from "../data/db";
const crypto = require("crypto");

const servers = new Hono();

servers.post("/register", async (c: Context) => {
    try {
        const body = await c.req.json();
        const validatedData = registrationRequestSchema.parse(body);

        // Generate a challenge
        const challenge = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Challenge expires in 5 minutes

        await Challenges.insertOne({
            name: validatedData.name,
            did: validatedData.did,
            url: validatedData.url,
            serverId: validatedData.did,
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
        const validatedData = registrationConfirmSchema.parse(body);

        // Retrieve the challenge
        const challengeDoc = await Challenges.findOne({ serverId: validatedData.did, challenge: validatedData.challenge });
        if (!challengeDoc) {
            return c.json({ success: false, message: "Invalid challenge" }, 400);
        }

        if (challengeDoc.expiresAt < new Date()) {
            return c.json({ success: false, message: "Expired challenge" }, 400);
        }

        // Verify the signature
        const verify = crypto.createVerify("SHA256");
        verify.update(challengeDoc.challenge);
        const isValidSignature = verify.verify(challengeDoc.publicKey, validatedData.signature, "base64");

        if (!isValidSignature) {
            return c.json({ success: false, message: "Invalid signature" }, 400);
        }

        // Update server as registered
        await Servers.updateOne(
            { did: validatedData.did },
            {
                $set: {
                    did: validatedData.did,
                    name: challengeDoc.name,
                    url: challengeDoc.url,
                    publicKey: challengeDoc.publicKey,
                    registeredAt: new Date(),
                },
            }
        );

        // Remove the used challenge
        await Challenges.deleteOne({ serverId: validatedData.did });

        return c.json({ success: true, message: "Server registered successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ success: false, message: "Invalid request data", errors: error.errors }, 400);
        }
        console.error("Error in server registration confirmation:", error);
        return c.json({ success: false, message: "Internal server error" }, 500);
    }
});

servers.get("/:serverId", async (c) => {
    // Implement get server details logic
});

export default servers;
