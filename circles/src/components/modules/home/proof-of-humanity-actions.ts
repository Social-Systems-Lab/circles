"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { sendNotifications } from "@/lib/data/notifications";
import {
    createOrUpdateHumanityVerification,
    revokeHumanityVerification,
} from "@/lib/data/proof-of-humanity";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { humanityVerificationLevelSchema, type HumanityVerificationLevel } from "@/models/models";

type ProofOfHumanityActionResult = {
    success: boolean;
    message: string;
};

const getProfileProofUrl = (handle?: string) => (handle ? `/circles/${handle}/home#proof-of-humanity` : "/");

export async function saveProofOfHumanityVerificationAction({
    subjectDid,
    level,
    note,
    acknowledgedPublic,
}: {
    subjectDid: string;
    level: HumanityVerificationLevel;
    note?: string;
    acknowledgedPublic: boolean;
}): Promise<ProofOfHumanityActionResult> {
    try {
        const verifierDid = await getAuthenticatedUserDid();
        if (!verifierDid) {
            return { success: false, message: "You need to be logged in to verify a profile." };
        }

        if (!acknowledgedPublic) {
            return { success: false, message: "You must acknowledge that this verification will be public." };
        }

        const parsedLevel = humanityVerificationLevelSchema.safeParse(level);
        if (!parsedLevel.success) {
            return { success: false, message: "Invalid verification level." };
        }

        if (verifierDid === subjectDid) {
            return { success: false, message: "You cannot verify your own profile." };
        }

        const [verifier, subject, subjectPrivate] = await Promise.all([
            getUserByDid(verifierDid),
            getUserByDid(subjectDid),
            getUserPrivate(subjectDid),
        ]);

        if (!verifier || !subject || !subjectPrivate || subject.circleType !== "user") {
            return { success: false, message: "Profile not found." };
        }

        const result = await createOrUpdateHumanityVerification({
            verifierDid,
            subjectDid,
            level: parsedLevel.data,
            note,
        });

        if (!result.verification) {
            return { success: false, message: "Could not save the verification." };
        }

        if (subject.did !== verifier.did && (result.changeType === "created" || result.changeType === "upgraded")) {
            const body =
                level === "met_in_real_life"
                    ? `${verifier.name || verifier.handle || "Someone"} publicly confirmed that they have met you in person.`
                    : `${verifier.name || verifier.handle || "Someone"} publicly verified that you are a real person.`;

            await sendNotifications("proof_of_humanity_verified", [subjectPrivate], {
                user: verifier,
                subject,
                humanityLevel: level,
                messageBody: body,
                url: getProfileProofUrl(subject.handle),
            });
        }

        revalidatePath(`/circles/${subject.handle}`);
        revalidatePath(`/circles/${subject.handle}/home`);

        return {
            success: true,
            message:
                result.changeType === "created"
                    ? "Your public verification was added."
                    : "Your public verification was updated.",
        };
    } catch (error) {
        console.error("Failed to save proof of humanity verification:", error);
        return { success: false, message: "Failed to save the verification." };
    }
}

export async function removeProofOfHumanityVerificationAction(subjectDid: string): Promise<ProofOfHumanityActionResult> {
    try {
        const verifierDid = await getAuthenticatedUserDid();
        if (!verifierDid) {
            return { success: false, message: "You need to be logged in to remove a verification." };
        }

        if (verifierDid === subjectDid) {
            return { success: false, message: "You cannot remove a verification from your own profile." };
        }

        const subject = await getUserByDid(subjectDid);
        if (!subject || subject.circleType !== "user") {
            return { success: false, message: "Profile not found." };
        }

        const removed = await revokeHumanityVerification(verifierDid, subjectDid);
        if (!removed) {
            return { success: false, message: "No active verification was found to remove." };
        }

        revalidatePath(`/circles/${subject.handle}`);
        revalidatePath(`/circles/${subject.handle}/home`);

        return { success: true, message: "Your public verification was removed." };
    } catch (error) {
        console.error("Failed to remove proof of humanity verification:", error);
        return { success: false, message: "Failed to remove the verification." };
    }
}
