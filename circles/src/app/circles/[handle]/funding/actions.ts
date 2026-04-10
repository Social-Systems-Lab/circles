"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { deleteFile, isFile, saveFile } from "@/lib/data/storage";
import {
    deriveFundingTrustBadgeType,
    getFundingAskDocumentById,
    getFundingCirclePermissions,
    insertFundingAsk,
    updateFundingAskDocument,
} from "@/lib/data/funding";
import { Circles, FundingAsks, Members } from "@/lib/data/db";
import {
    fileInfoSchema,
    fundingAskBeneficiaryTypeSchema,
    fundingAskCategorySchema,
    fundingAskSchema,
} from "@/models/models";
import { isVerifiedUser } from "@/lib/auth/verification";

const submissionIntentSchema = z.enum(["draft", "publish", "update"]);

const fundingAskFormSchema = z
    .object({
        title: z.string().trim().min(1, "Title is required"),
        shortStory: z.string().trim().min(1, "Short story is required").max(280, "Short story is too long"),
        description: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
        category: fundingAskCategorySchema,
        amount: z.coerce.number().positive("Amount must be greater than zero"),
        currency: z
            .string()
            .trim()
            .min(1, "Currency is required")
            .max(8, "Currency must be short")
            .transform((value) => value.toUpperCase()),
        quantity: z.preprocess(
            (value) => (value === "" || value == null ? undefined : Number(value)),
            z.number().positive("Quantity must be greater than zero").optional(),
        ),
        unitLabel: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(80, "Unit label must be 80 characters or fewer").optional(),
        ),
        isProxy: z.preprocess((value) => value === "true" || value === true, z.boolean()),
        beneficiaryType: fundingAskBeneficiaryTypeSchema,
        beneficiaryName: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(120, "Beneficiary name must be 120 characters or fewer").optional(),
        ),
        proxyNote: z.preprocess(
            (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
            z.string().max(500, "Proxy note must be 500 characters or fewer").optional(),
        ),
        completionPlan: z.string().trim().min(1, "Completion plan is required").max(1000, "Completion plan is too long"),
        submissionIntent: submissionIntentSchema,
    })
    .superRefine((value, context) => {
        if (value.isProxy && !value.beneficiaryName) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["beneficiaryName"],
                message: "Beneficiary name is required for proxy asks",
            });
        }
    });

const completionSchema = z.object({
    completionNote: z.string().trim().min(1, "Completion note is required").max(1500, "Completion note is too long"),
});

type FundingActionResult = {
    success: boolean;
    message: string;
    askId?: string;
};

const revalidateFundingPaths = (circleHandle: string, askId?: string) => {
    revalidatePath(`/circles/${circleHandle}/home`);
    revalidatePath(`/circles/${circleHandle}/funding`);
    revalidatePath(`/circles/${circleHandle}`);
    if (askId) {
        revalidatePath(`/circles/${circleHandle}/funding/${askId}`);
        revalidatePath(`/circles/${circleHandle}/funding/${askId}/edit`);
    }
};

const getCoverImageInput = async (formData: FormData) => {
    const coverImageEntries = formData.getAll("coverImage");
    const firstEntry = coverImageEntries[0];

    if (!firstEntry) {
        return null;
    }

    if (typeof firstEntry === "string") {
        const parsed = fileInfoSchema.safeParse(JSON.parse(firstEntry));
        return parsed.success ? parsed.data : null;
    }

    return isFile(firstEntry) ? firstEntry : null;
};

const resolveCoverImage = async ({
    formData,
    circleId,
    existingCoverImage,
}: {
    formData: FormData;
    circleId: string;
    existingCoverImage?: z.infer<typeof fileInfoSchema>;
}): Promise<{
    coverImage: z.infer<typeof fileInfoSchema> | undefined;
    shouldDeleteExisting: boolean;
}> => {
    const coverImageInput = await getCoverImageInput(formData);

    if (!coverImageInput) {
        return {
            coverImage: undefined,
            shouldDeleteExisting: Boolean(existingCoverImage),
        };
    }

    if (!isFile(coverImageInput)) {
        return {
            coverImage: coverImageInput as z.infer<typeof fileInfoSchema>,
            shouldDeleteExisting: false,
        };
    }

    const uploadedCoverImage = await saveFile(coverImageInput as File, "funding-ask-cover", circleId, false);
    return {
        coverImage: uploadedCoverImage,
        shouldDeleteExisting: Boolean(existingCoverImage?.url && existingCoverImage.url !== uploadedCoverImage.url),
    };
};

const getCreatorBadgeType = async ({
    circleId,
    userDid,
    isProxy,
}: {
    circleId: string;
    userDid: string;
    isProxy: boolean;
}) => {
    const [membership, creator] = await Promise.all([
        Members.findOne({ circleId, userDid }),
        Circles.findOne({ did: userDid }),
    ]);

    return deriveFundingTrustBadgeType({
        isCircleAdmin: membership?.userGroups?.includes("admins") ?? false,
        isVerifiedCreator: isVerifiedUser(creator),
        isProxy,
    });
};

export async function createFundingAskAction(circleHandle: string, formData: FormData): Promise<FundingActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle?._id || !circle.handle) {
            return { success: false, message: "Circle not found" };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        if (!permissions.canCreate) {
            return { success: false, message: "You do not have permission to create funding asks in this circle." };
        }

        const parsed = fundingAskFormSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!parsed.success) {
            return {
                success: false,
                message: parsed.error.issues[0]?.message || "Funding ask form is invalid.",
            };
        }

        const creator = await Circles.findOne({ did: userDid });
        const { coverImage } = await resolveCoverImage({
            formData,
            circleId: circle._id.toString(),
        });
        const trustBadgeType = await getCreatorBadgeType({
            circleId: circle._id.toString(),
            userDid,
            isProxy: parsed.data.isProxy,
        });
        const now = new Date();

        const createdAsk = await insertFundingAsk(
            fundingAskSchema.parse({
                circleId: circle._id.toString(),
                circleHandleSnapshot: circle.handle,
                createdByDid: userDid,
                createdByHandleSnapshot: creator?.handle,
                title: parsed.data.title,
                shortStory: parsed.data.shortStory,
                description: parsed.data.description,
                category: parsed.data.category,
                amount: parsed.data.amount,
                currency: parsed.data.currency,
                quantity: parsed.data.quantity,
                unitLabel: parsed.data.unitLabel,
                status: parsed.data.submissionIntent === "draft" ? "draft" : "open",
                isProxy: parsed.data.isProxy,
                beneficiaryType: parsed.data.isProxy ? parsed.data.beneficiaryType : "self",
                beneficiaryName: parsed.data.beneficiaryName,
                proxyNote: parsed.data.proxyNote,
                completionPlan: parsed.data.completionPlan,
                coverImage,
                trustBadgeType,
                createdAt: now,
                updatedAt: now,
            }),
        );

        revalidateFundingPaths(circleHandle, createdAsk._id?.toString?.() ?? createdAsk._id);
        return {
            success: true,
            message: parsed.data.submissionIntent === "draft" ? "Funding ask saved as draft." : "Funding ask published.",
            askId: createdAsk._id?.toString?.() ?? createdAsk._id,
        };
    } catch (error) {
        console.error("Error creating funding ask:", error);
        return { success: false, message: "Failed to create funding ask." };
    }
}

export async function updateFundingAskAction(
    circleHandle: string,
    askId: string,
    formData: FormData,
): Promise<FundingActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle?._id || !circle.handle) {
            return { success: false, message: "Circle not found" };
        }

        const existingAsk = await getFundingAskDocumentById(askId);
        if (!existingAsk || existingAsk.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding ask not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isCircleAdmin || existingAsk.createdByDid === userDid;
        if (!canManage) {
            return { success: false, message: "You do not have permission to edit this funding ask." };
        }

        const parsed = fundingAskFormSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!parsed.success) {
            return {
                success: false,
                message: parsed.error.issues[0]?.message || "Funding ask form is invalid.",
            };
        }

        const { coverImage, shouldDeleteExisting } = await resolveCoverImage({
            formData,
            circleId: circle._id.toString(),
            existingCoverImage: existingAsk.coverImage,
        });

        const nextStatus =
            parsed.data.submissionIntent === "draft"
                ? "draft"
                : parsed.data.submissionIntent === "publish"
                  ? existingAsk.status === "completed" || existingAsk.status === "closed"
                      ? existingAsk.status
                      : "open"
                  : existingAsk.status;

        const trustBadgeType = await getCreatorBadgeType({
            circleId: circle._id.toString(),
            userDid: existingAsk.createdByDid,
            isProxy: parsed.data.isProxy,
        });

        const updated = await updateFundingAskDocument(askId, {
            title: parsed.data.title,
            shortStory: parsed.data.shortStory,
            description: parsed.data.description,
            category: parsed.data.category,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            quantity: parsed.data.quantity,
            unitLabel: parsed.data.unitLabel,
            status: nextStatus,
            isProxy: parsed.data.isProxy,
            beneficiaryType: parsed.data.isProxy ? parsed.data.beneficiaryType : "self",
            beneficiaryName: parsed.data.beneficiaryName,
            proxyNote: parsed.data.proxyNote,
            completionPlan: parsed.data.completionPlan,
            coverImage,
            trustBadgeType,
            updatedAt: new Date(),
        });

        if (!updated) {
            return { success: false, message: "Funding ask update failed." };
        }

        if (shouldDeleteExisting && existingAsk.coverImage?.url) {
            try {
                await deleteFile(existingAsk.coverImage.url);
            } catch (error) {
                console.error("Failed to delete replaced funding ask image:", error);
            }
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: nextStatus === "draft" ? "Funding ask saved as draft." : "Funding ask updated.",
            askId,
        };
    } catch (error) {
        console.error("Error updating funding ask:", error);
        return { success: false, message: "Failed to update funding ask." };
    }
}

export async function claimFundingAskAction(circleHandle: string, askId: string): Promise<FundingActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle?._id) {
            return { success: false, message: "Circle not found" };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        if (!permissions.canView) {
            return { success: false, message: "Funding asks are members-only in this circle." };
        }

        const ask = await getFundingAskDocumentById(askId);
        if (!ask || ask.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding ask not found." };
        }

        if (ask.status !== "open") {
            return { success: false, message: "This funding ask is no longer open." };
        }

        if (ask.createdByDid === userDid) {
            return { success: false, message: "You cannot claim your own funding ask." };
        }

        const supporter = await Circles.findOne({ did: userDid });
        const now = new Date();
        const result = await FundingAsks.updateOne(
            {
                _id: new ObjectId(askId),
                circleId: circle._id.toString(),
                status: "open",
            },
            {
                $set: {
                    status: "in_progress",
                    activeSupporterDid: userDid,
                    activeSupporterHandleSnapshot: supporter?.handle,
                    activeSupportStartedAt: now,
                    updatedAt: now,
                },
            },
        );

        if (result.modifiedCount === 0) {
            return { success: false, message: "Someone else has already claimed this funding ask." };
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: "You are now supporting this ask.",
            askId,
        };
    } catch (error) {
        console.error("Error claiming funding ask:", error);
        return { success: false, message: "Failed to claim funding ask." };
    }
}

export async function completeFundingAskAction(
    circleHandle: string,
    askId: string,
    completionNote: string,
): Promise<FundingActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle?._id) {
            return { success: false, message: "Circle not found" };
        }

        const ask = await getFundingAskDocumentById(askId);
        if (!ask || ask.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding ask not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isCircleAdmin || ask.createdByDid === userDid;
        if (!canManage) {
            return { success: false, message: "You do not have permission to complete this ask." };
        }

        if (ask.status !== "in_progress") {
            return { success: false, message: "Only in-progress asks can be marked completed." };
        }

        const parsed = completionSchema.safeParse({ completionNote });
        if (!parsed.success) {
            return { success: false, message: parsed.error.issues[0]?.message || "Completion note is invalid." };
        }

        const now = new Date();
        const updated = await updateFundingAskDocument(askId, {
            status: "completed",
            completionNote: parsed.data.completionNote,
            completedAt: now,
            updatedAt: now,
        });

        if (!updated) {
            return { success: false, message: "Failed to complete funding ask." };
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: "Funding ask marked completed.",
            askId,
        };
    } catch (error) {
        console.error("Error completing funding ask:", error);
        return { success: false, message: "Failed to complete funding ask." };
    }
}

export async function closeFundingAskAction(circleHandle: string, askId: string): Promise<FundingActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle?._id) {
            return { success: false, message: "Circle not found" };
        }

        const ask = await getFundingAskDocumentById(askId);
        if (!ask || ask.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding ask not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isCircleAdmin || ask.createdByDid === userDid;
        if (!canManage) {
            return { success: false, message: "You do not have permission to close this ask." };
        }

        if (ask.status === "completed" || ask.status === "closed") {
            return { success: false, message: "This funding ask is already closed to new support." };
        }

        const now = new Date();
        const updated = await updateFundingAskDocument(askId, {
            status: "closed",
            closedAt: now,
            updatedAt: now,
        });

        if (!updated) {
            return { success: false, message: "Failed to close funding ask." };
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: "Funding ask closed.",
            askId,
        };
    } catch (error) {
        console.error("Error closing funding ask:", error);
        return { success: false, message: "Failed to close funding ask." };
    }
}
