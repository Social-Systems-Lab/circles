"use server";

import { z } from "zod";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { db } from "@/lib/data/db";
import { Circle, UserPrivate, VerificationRequest } from "@/models/models";
import { ObjectId } from "mongodb";
import { sendEmail } from "@/lib/data/email";
import { getUserPrivate } from "@/lib/data/user";
import { sendVerificationRequestNotification } from "@/lib/data/notifications";
import { getVerificationStatus as getStatus } from "@/lib/data/user";

export async function getVerificationStatus() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("User not authenticated.");
    }
    return await getStatus(userDid);
}

const requestVerificationSchema = z.object({});

export async function requestVerification(
    prevState: { message: string },
    formData: FormData,
): Promise<{ message: string }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { message: "User not authenticated." };
    }

    const user = await getUserPrivate(userDid);
    if (!user) {
        return { message: "User not found." };
    }

    const verificationCollection = db.collection<VerificationRequest>("verifications");

    const existingRequest = await verificationCollection.findOne({
        userDid: user.did,
        status: "pending",
    });

    if (existingRequest) {
        return { message: "You already have a pending verification request." };
    }

    const newRequest: VerificationRequest = {
        _id: new ObjectId(),
        userDid: user.did!,
        status: "pending",
        requestedAt: new Date(),
    };

    await verificationCollection.insertOne(newRequest);

    const admins = await db.collection<Circle>("circles").find({ isAdmin: true }).toArray();
    const adminUserPrivates = (await Promise.all(admins.map((admin) => getUserPrivate(admin.did!)))).filter(
        (up): up is UserPrivate => up !== null,
    );

    // Notify admins
    if (adminUserPrivates.length > 0) {
        await sendVerificationRequestNotification(user, adminUserPrivates);
    }

    // Send email
    await sendEmail({
        to: "hello@socialsystems.io",
        templateAlias: "custom",
        templateModel: {
            subject: "New Account Verification Request",
            header: "New Account Verification Request",
            body: `User ${user.name} (@${user.handle}) has requested account verification. View the request in the <a href="https://circles.socialsystems.io/admin?tab=users">admin dashboard</a>.`,
        },
    });

    return { message: "Verification request submitted successfully." };
}
