"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByHandle } from "@/lib/data/circle";
import { deleteFile, isFile, saveFile } from "@/lib/data/storage";
import {
    deriveFundingTrustBadgeType,
    getFundingAskDocumentById,
    getFundingCirclePermissions,
    isFundingEnabledForCircle,
    insertFundingAsk,
    updateFundingAskDocument,
} from "@/lib/data/funding";
import { Circles } from "@/lib/data/db";
import {
    fileInfoSchema,
    fundingAskCurrencySchema,
    fundingAskBeneficiaryTypeSchema,
    fundingAskItemSchema,
    fundingAskSchema,
} from "@/models/models";

const submissionIntentSchema = z.enum(["draft", "publish", "update"]);

const fundingAskFormSchema = z
    .object({
        title: z.string().trim().min(1, "Title is required"),
        shortStory: z.string().trim().min(1, "Short story is required").max(280, "Short story is too long"),
        description: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
        currency: z.preprocess(
            (value) => (typeof value === "string" ? value.toUpperCase() : value),
            fundingAskCurrencySchema.optional(),
        ),
        items: z.preprocess((value) => {
            if (Array.isArray(value)) {
                return value;
            }

            if (typeof value !== "string" || !value.trim()) {
                return [];
            }

            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }, z.array(fundingAskItemSchema).min(1, "Add at least one funding item").max(25, "Add at most 25 funding items")),
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

const normalizeFundingItemsForStorage = (
    items: z.infer<typeof fundingAskItemSchema>[],
    status: "draft" | "open" | "completed" | "closed",
) =>
    items.map((item) => ({
        title: item.title.trim(),
        category: item.category,
        price: item.price,
        currency: item.currency,
        quantity: item.quantity,
        unitLabel: item.unitLabel?.trim() || undefined,
        note: item.note?.trim() || undefined,
        status,
    }));

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
        if (!isFundingEnabledForCircle(circle)) {
            return { success: false, message: "Funding Needs are not enabled for this circle." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        if (!permissions.canCreate) {
            return { success: false, message: "You do not have permission to create funding requests in this circle." };
        }

        const parsed = fundingAskFormSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!parsed.success) {
            return {
                success: false,
                message: parsed.error.issues[0]?.message || "Funding request form is invalid.",
            };
        }

        const creator = await Circles.findOne({ did: userDid });
        const { coverImage } = await resolveCoverImage({
            formData,
            circleId: circle._id.toString(),
        });
        const now = new Date();
        const requestStatus = parsed.data.submissionIntent === "draft" ? "draft" : "open";
        const trustBadgeType = deriveFundingTrustBadgeType({
            isProxy: parsed.data.isProxy,
        });

        const createdAsk = await insertFundingAsk(
            fundingAskSchema.parse({
                circleId: circle._id.toString(),
                circleHandleSnapshot: circle.handle,
                createdByDid: userDid,
                createdByHandleSnapshot: creator?.handle,
                title: parsed.data.title,
                shortStory: parsed.data.shortStory,
                description: parsed.data.description,
                items: normalizeFundingItemsForStorage(parsed.data.items, requestStatus),
                status: requestStatus,
                isProxy: parsed.data.isProxy,
                beneficiaryType: parsed.data.isProxy ? parsed.data.beneficiaryType : "self",
                beneficiaryName: parsed.data.beneficiaryName,
                proxyNote: parsed.data.proxyNote,
                coverImage,
                trustBadgeType,
                createdAt: now,
                updatedAt: now,
            }),
        );

        revalidateFundingPaths(circleHandle, createdAsk._id?.toString?.() ?? createdAsk._id);
        return {
            success: true,
            message:
                parsed.data.submissionIntent === "draft"
                    ? "Funding request saved as draft."
                    : "Funding request published.",
            askId: createdAsk._id?.toString?.() ?? createdAsk._id,
        };
    } catch (error) {
        console.error("Error creating funding request:", error);
        return { success: false, message: "Failed to create funding request." };
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
        if (!isFundingEnabledForCircle(circle)) {
            return { success: false, message: "Funding Needs are not enabled for this circle." };
        }

        const existingAsk = await getFundingAskDocumentById(askId);
        if (!existingAsk || existingAsk.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding request not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isSuperAdmin;
        if (!canManage) {
            return { success: false, message: "You do not have permission to edit this funding request." };
        }

        const parsed = fundingAskFormSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!parsed.success) {
            return {
                success: false,
                message: parsed.error.issues[0]?.message || "Funding request form is invalid.",
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

        const trustBadgeType = deriveFundingTrustBadgeType({
            isProxy: parsed.data.isProxy,
        });
        const itemStatus = nextStatus === "draft" ? "draft" : nextStatus === "closed" ? "closed" : nextStatus === "completed" ? "completed" : "open";

        const updated = await updateFundingAskDocument(askId, {
            title: parsed.data.title,
            shortStory: parsed.data.shortStory,
            description: parsed.data.description,
            category: undefined,
            amount: undefined,
            currency: undefined,
            items: normalizeFundingItemsForStorage(parsed.data.items, itemStatus),
            status: nextStatus,
            isProxy: parsed.data.isProxy,
            beneficiaryType: parsed.data.isProxy ? parsed.data.beneficiaryType : "self",
            beneficiaryName: parsed.data.beneficiaryName,
            proxyNote: parsed.data.proxyNote,
            completionPlan: undefined,
            coverImage,
            trustBadgeType,
            activeSupporterDid: undefined,
            activeSupporterHandleSnapshot: undefined,
            activeSupportStartedAt: undefined,
            updatedAt: new Date(),
        });

        if (!updated) {
            return { success: false, message: "Funding request update failed." };
        }

        if (shouldDeleteExisting && existingAsk.coverImage?.url) {
            try {
                await deleteFile(existingAsk.coverImage.url);
            } catch (error) {
                console.error("Failed to delete replaced funding request image:", error);
            }
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: nextStatus === "draft" ? "Funding request saved as draft." : "Funding request updated.",
            askId,
        };
    } catch (error) {
        console.error("Error updating funding request:", error);
        return { success: false, message: "Failed to update funding request." };
    }
}

export async function claimFundingAskAction(circleHandle: string, askId: string): Promise<FundingActionResult> {
    return {
        success: false,
        message: "Demo only - payment flow not connected yet.",
        askId,
    };
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
        if (!isFundingEnabledForCircle(circle)) {
            return { success: false, message: "Funding Needs are not enabled for this circle." };
        }

        const ask = await getFundingAskDocumentById(askId);
        if (!ask || ask.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding request not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isSuperAdmin;
        if (!canManage) {
            return { success: false, message: "You do not have permission to complete this funding request." };
        }

        if (ask.status === "closed" || ask.status === "completed") {
            return { success: false, message: "Only active funding requests can be marked completed." };
        }

        const parsed = completionSchema.safeParse({ completionNote });
        if (!parsed.success) {
            return { success: false, message: parsed.error.issues[0]?.message || "Completion note is invalid." };
        }

        const now = new Date();
        const updated = await updateFundingAskDocument(askId, {
            status: "completed",
            completionNote: parsed.data.completionNote,
            items: (ask.items || []).map((item) => ({ ...item, status: "completed" })),
            completedAt: now,
            updatedAt: now,
            activeSupporterDid: undefined,
            activeSupporterHandleSnapshot: undefined,
            activeSupportStartedAt: undefined,
        });

        if (!updated) {
            return { success: false, message: "Failed to complete funding request." };
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: "Funding request marked completed.",
            askId,
        };
    } catch (error) {
        console.error("Error completing funding request:", error);
        return { success: false, message: "Failed to complete funding request." };
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
        if (!isFundingEnabledForCircle(circle)) {
            return { success: false, message: "Funding Needs are not enabled for this circle." };
        }

        const ask = await getFundingAskDocumentById(askId);
        if (!ask || ask.circleId !== circle._id.toString()) {
            return { success: false, message: "Funding request not found." };
        }

        const permissions = await getFundingCirclePermissions(circle, userDid);
        const canManage = permissions.isSuperAdmin;
        if (!canManage) {
            return { success: false, message: "You do not have permission to close this funding request." };
        }

        if (ask.status === "completed" || ask.status === "closed") {
            return { success: false, message: "This funding request is already closed to new support." };
        }

        const now = new Date();
        const updated = await updateFundingAskDocument(askId, {
            status: "closed",
            items: (ask.items || []).map((item) => ({
                ...item,
                status: item.status === "completed" ? "completed" : "closed",
            })),
            closedAt: now,
            updatedAt: now,
            activeSupporterDid: undefined,
            activeSupporterHandleSnapshot: undefined,
            activeSupportStartedAt: undefined,
        });

        if (!updated) {
            return { success: false, message: "Failed to close funding request." };
        }

        revalidateFundingPaths(circleHandle, askId);
        return {
            success: true,
            message: "Funding request closed.",
            askId,
        };
    } catch (error) {
        console.error("Error closing funding request:", error);
        return { success: false, message: "Failed to close funding request." };
    }
}
