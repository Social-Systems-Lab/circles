"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import {
    approveAttachCircleRequest,
    createAttachCircleRequest,
    declineAttachCircleRequest,
} from "@/lib/data/circle-attach";
import { approveDetachCircleRequest, createDetachCircleRequest, declineDetachCircleRequest } from "@/lib/data/circle-detach";
import { getUserPrivate } from "@/lib/data/user";
import {
    addApplicantVerificationMessage,
    createVerificationRequest,
    getActiveVerificationRequestForIndependentCircle,
    getIndependentCircleVerificationThread,
    getVerificationAdmins,
    notifyAdminsOfApplicantVerificationReply,
} from "@/lib/data/verification-workflow";
import {
    sendAttachCircleRequestNotification,
    sendDetachCircleRequestNotification,
    sendVerificationRequestNotification,
} from "@/lib/data/notifications";
import { getMembers } from "@/lib/data/member";
import { Circle, FileInfo, FormSubmitResponse, Media, UserPrivate } from "@/models/models"; // Added Media, FileInfo
import { ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { revalidatePath } from "next/cache";
import { features } from "@/lib/data/constants";
import { isFile, saveFile, deleteFile } from "@/lib/data/storage"; // Added deleteFile
import { sanitizeSocialLinks } from "@/lib/utils/social-links";
import { getVerificationReadiness } from "@/lib/verification-readiness";
import {
    getPeerifyIdentityType,
    isPeerifyManagedIdentity,
    normalizePeerifyArtistProfile,
    type PeerifyArtistProfile,
} from "@/lib/peerify/artist-profile";

const normalizeWebsiteUrl = (url?: string) => {
    if (!url) return undefined;
    const trimmed = url.trim();
    if (!trimmed) return undefined;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
};

const normalizeOfficialEmail = (email?: string) => {
    const normalized = email?.trim().toLowerCase();
    return normalized ? normalized : undefined;
};

async function revalidateCircleDetachPaths(circleId: string, parentCircleId?: string | null) {
    await revalidateCircleStructurePaths(circleId, parentCircleId ? [parentCircleId] : []);
}

async function revalidateCircleStructurePaths(circleId: string, relatedCircleIds: Array<string | null | undefined>) {
    const circle = await getCircleById(circleId);
    if (!circle) {
        revalidatePath("/circles");
        return;
    }

    const circlePath = await getCirclePath(circle);
    revalidatePath(circlePath);
    revalidatePath(`${circlePath}settings/about`);

    for (const relatedCircleId of Array.from(new Set(relatedCircleIds.filter(Boolean)))) {
        const relatedCircle = await getCircleById(relatedCircleId || null);
        if (!relatedCircle) {
            continue;
        }

        const relatedCirclePath = await getCirclePath(relatedCircle);
        revalidatePath(relatedCirclePath);
        revalidatePath(`${relatedCirclePath}communities`);
        revalidatePath(`${relatedCirclePath}settings/about`);
    }

    revalidatePath("/circles");
}

async function updateCirclePublishStatus(circleId: string, publishStatus: "published" | "pending_verification") {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to edit circle settings" };
    }

    const circle = await getCircleById(circleId);
    if (!circle) {
        return { success: false, message: "Circle not found" };
    }

    if (circle.circleType === "user") {
        return { success: false, message: "User profiles do not support this workflow" };
    }

    await updateCircle({ _id: circleId, publishStatus }, userDid);

    const circlePath = await getCirclePath(circle);
    revalidatePath(circlePath);
    revalidatePath(`${circlePath}settings/about`);
    revalidatePath("/circles");

    return { success: true, message: "Circle workflow updated successfully" };
}

export async function publishCircleAction(formData: FormData) {
    const circleId = String(formData.get("circleId") || "");
    if (!circleId) {
        return { success: false, message: "Circle not found" };
    }

    const circle = await getCircleById(circleId);
    if (!circle) {
        return { success: false, message: "Circle not found" };
    }

    if (circle.circleLevel !== "profile_child") {
        return { success: false, message: "Only profile circles can be published directly" };
    }

    return updateCirclePublishStatus(circleId, "published");
}

export async function submitCircleForVerificationAction(formData: FormData) {
    const circleId = String(formData.get("circleId") || "");
    if (!circleId) {
        return { success: false, message: "Circle not found" };
    }

    const circle = await getCircleById(circleId);
    if (!circle) {
        return { success: false, message: "Circle not found" };
    }

    if (circle.circleLevel === "profile_child") {
        return { success: false, message: "Profile circles should be published directly" };
    }

    const readiness = getVerificationReadiness(circle);
    if (!readiness.isReady) {
        return { success: false, message: readiness.title, data: { readiness } };
    }

    if (circle.representsOrganization) {
        if (!circle.organizationName?.trim()) {
            return {
                success: false,
                message: "Add the official organization name before submitting this circle for verification.",
            };
        }

        if (!normalizeWebsiteUrl(circle.websiteUrl)) {
            return {
                success: false,
                message: "Add an organization website before submitting this circle for verification.",
            };
        }

        if (!normalizeOfficialEmail(circle.officialEmail)) {
            return {
                success: false,
                message: "Add an official organization email before submitting this circle for verification.",
            };
        }
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to edit circle settings" };
    }

    const existingRequest = await getActiveVerificationRequestForIndependentCircle(circleId);
    if (existingRequest) {
        if (circle.publishStatus !== "pending_verification") {
            await updateCirclePublishStatus(circleId, "pending_verification");
        }
        return { success: true, message: "A verification request for this circle is already pending review." };
    }

    await createVerificationRequest({
        userDid,
        requestType: "independent_circle",
        targetCircleId: circleId,
    });

    const submitter = await getUserPrivate(userDid);
    const admins = await getVerificationAdmins();
    if (admins.length > 0) {
        await sendVerificationRequestNotification(submitter, admins, {
            messageBody: `${submitter.name || "A user"} submitted ${circle.name || "an independent circle"} for verification.`,
            url: "/admin?tab=verification-requests",
        });
    }

    return updateCirclePublishStatus(circleId, "pending_verification");
}

export async function createDetachCircleRequestAction(circleId: string): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to detach this circle" };
    }

    try {
        const result = await createDetachCircleRequest({ circleId, requestedByDid: userDid });
        await revalidateCircleDetachPaths(result.circle._id?.toString() ?? circleId, result.parentCircle?._id?.toString?.());

        if (result.status === "pending" && result.request) {
            const requester = await getUserPrivate(userDid);
            const remainingAdminDids = result.request.requiredAdminDids.filter(
                (did) => !result.request!.approvedByDids.includes(did),
            );
            const remainingAdmins = (await Promise.all(remainingAdminDids.map((did) => getUserPrivate(did)))).filter(
                (admin): admin is UserPrivate => Boolean(admin?.did),
            );

            if (requester && remainingAdmins.length > 0) {
                const circlePath = await getCirclePath(result.circle);
                await sendDetachCircleRequestNotification(requester, result.circle, remainingAdmins, {
                    messageBody: `${requester.name || "An admin"} requested to make ${result.circle.name || "this circle"} an independent circle.`,
                    url: `${circlePath}settings/about`,
                });
            }
        }

        return {
            success: true,
            message:
                result.status === "detached"
                    ? "Circle detached and is now independent"
                    : "Detach request created. The remaining circle admins must approve it.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not start the detach request.",
        };
    }
}

export async function approveDetachCircleRequestAction(requestId: string): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to review this detach request" };
    }

    try {
        const result = await approveDetachCircleRequest({ requestId, adminDid: userDid });
        await revalidateCircleDetachPaths(
            result.circle._id?.toString() ?? result.request.circleId,
            result.parentCircle?._id?.toString?.() ?? result.request.parentCircleId,
        );

        return {
            success: true,
            message:
                result.status === "approved"
                    ? "Detach approved. The circle is now independent."
                    : "Your approval was recorded.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not approve the detach request.",
        };
    }
}

export async function createAttachCircleRequestAction(
    circleId: string,
    targetParentCircleHandle: string,
): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to move this circle" };
    }

    try {
        const result = await createAttachCircleRequest({
            circleId,
            targetParentCircleHandle,
            requestedByDid: userDid,
        });
        await revalidateCircleStructurePaths(result.circle._id?.toString() ?? circleId, [
            result.fromParentCircle?._id?.toString?.(),
            result.toParentCircle._id?.toString?.(),
        ]);

        const requester = await getUserPrivate(userDid);
        const targetAdminDids = await getMembers(result.toParentCircle._id?.toString?.() ?? "")
            .then((members) => members.filter((member) => member.userGroups?.includes("admins")))
            .then((members) => members.map((member) => member.userDid));
        const targetAdmins = (
            await Promise.all(targetAdminDids.map((did) => getUserPrivate(did)))
        ).filter((admin): admin is UserPrivate => Boolean(admin?.did));

        if (requester && targetAdmins.length > 0) {
            const targetCirclePath = await getCirclePath(result.toParentCircle);
            await sendAttachCircleRequestNotification(requester, result.circle, result.toParentCircle, targetAdmins, {
                messageBody: `${requester.name || "An admin"} requested to move ${result.circle.name || "this circle"} under ${result.toParentCircle.name || "this parent circle"}.`,
                url: `${targetCirclePath}settings/about`,
            });
        }

        return {
            success: true,
            message: "Move request created and sent to the target parent circle admins.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not start the move request.",
        };
    }
}

export async function approveAttachCircleRequestAction(requestId: string): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to review this move request" };
    }

    try {
        const result = await approveAttachCircleRequest({ requestId, adminDid: userDid });
        await revalidateCircleStructurePaths(result.circle._id?.toString() ?? result.request.circleId, [
            result.fromParentCircle?._id?.toString?.(),
            result.toParentCircle._id?.toString?.(),
        ]);

        return {
            success: true,
            message: "Move request approved. The circle has been attached to the new parent.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not approve the move request.",
        };
    }
}

export async function declineAttachCircleRequestAction(requestId: string): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to review this move request" };
    }

    try {
        const result = await declineAttachCircleRequest({ requestId, adminDid: userDid });
        await revalidateCircleStructurePaths(result.circle._id?.toString() ?? result.request.circleId, [
            result.fromParentCircle?._id?.toString?.(),
            result.toParentCircle._id?.toString?.(),
        ]);

        return {
            success: true,
            message: "Move request declined.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not decline the move request.",
        };
    }
}

export async function declineDetachCircleRequestAction(requestId: string): Promise<FormSubmitResponse> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to review this detach request" };
    }

    try {
        const result = await declineDetachCircleRequest({ requestId, adminDid: userDid });
        await revalidateCircleDetachPaths(
            result.circle._id?.toString() ?? result.request.circleId,
            result.parentCircle?._id?.toString?.() ?? result.request.parentCircleId,
        );

        return {
            success: true,
            message: "Detach request declined.",
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not decline the detach request.",
        };
    }
}

export async function getIndependentCircleVerificationThreadAction(circleId: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }

    const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
    if (!authorized) {
        throw new Error("Unauthorized");
    }

    return await getIndependentCircleVerificationThread(circleId, userDid);
}

export async function replyToIndependentCircleVerificationThreadAction(formData: FormData) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized" };
    }

    const circleIdValue = formData.get("circleId");
    const requestIdValue = formData.get("requestId");
    const bodyValue = formData.get("body");
    const files = formData
        .getAll("attachments")
        .filter((value): value is File => value instanceof File && value.size > 0);

    if (typeof circleIdValue !== "string" || !circleIdValue) {
        return { success: false, message: "Circle not found" };
    }

    const authorized = await isAuthorized(userDid, circleIdValue, features.settings.edit_about);
    if (!authorized) {
        return { success: false, message: "You are not authorized to edit circle settings" };
    }

    if (typeof requestIdValue !== "string" || !requestIdValue) {
        return { success: false, message: "Verification request not found." };
    }

    const body = typeof bodyValue === "string" ? bodyValue : "";

    try {
        const result = await addApplicantVerificationMessage({
            requestId: requestIdValue,
            applicantDid: userDid,
            body,
            files,
        });

        const admins = await getVerificationAdmins(userDid);
        await notifyAdminsOfApplicantVerificationReply(result.applicant, admins);

        const circle = await getCircleById(circleIdValue);
        const circlePath = circle ? await getCirclePath(circle) : null;
        if (circlePath) {
            revalidatePath(circlePath);
            revalidatePath(`${circlePath}settings/about`);
        }
        revalidatePath("/circles");
        revalidatePath("/admin");

        return { success: true, message: "Reply sent." };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Could not send reply.",
        };
    }
}

export async function saveAbout(values: {
    _id: any;
    name?: string;
    handle?: string;
    description?: string;
    content?: string;
    mission?: string;
    picture?: any;
    // cover?: any; // Removed cover
    images?: ImageItem[]; // Added images
    isPublic?: boolean;
    showAdminsPublicly?: boolean;
    location?: any;
    socialLinks?: any;
    websiteUrl?: string;
    representsOrganization?: boolean;
    organizationName?: string;
    officialEmail?: string;
    peerifyArtistIntent?: boolean;
    peerifyArtistProfile?: PeerifyArtistProfile;
}): Promise<FormSubmitResponse> {
    console.log("Saving circle about with values (images length):", values.images?.length);

    let circleUpdateData: Partial<Circle> = {
        _id: values._id,
        name: values.name,
        handle: values.handle,
        description: values.description,
        content: values.content,
        mission: values.mission,
        isPublic: values.isPublic,
        showAdminsPublicly: values.showAdminsPublicly,
        location: values.location,
        socialLinks: sanitizeSocialLinks(values.socialLinks),
    };

    // Normalize website URL and include if present
    const normalizedWebsite = normalizeWebsiteUrl(values.websiteUrl);
    circleUpdateData.websiteUrl = normalizedWebsite;
    const representsOrganization = values.representsOrganization === true;
    circleUpdateData.representsOrganization = representsOrganization;
    circleUpdateData.organizationName = representsOrganization ? values.organizationName?.trim() || undefined : undefined;
    circleUpdateData.officialEmail = representsOrganization ? normalizeOfficialEmail(values.officialEmail) : undefined;

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, circleUpdateData._id ?? "", features.settings.edit_about);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        if (existingCircle.circleType !== "user" && existingCircle.circleLevel === "profile_child") {
            circleUpdateData.representsOrganization = undefined;
            circleUpdateData.organizationName = undefined;
            circleUpdateData.officialEmail = undefined;
        }

        if (existingCircle.circleType === "user") {
            const existingMetadata =
                existingCircle.metadata && typeof existingCircle.metadata === "object" && !Array.isArray(existingCircle.metadata)
                    ? { ...(existingCircle.metadata as Record<string, unknown>) }
                    : {};
            const existingPeerify =
                existingMetadata.peerify && typeof existingMetadata.peerify === "object" && !Array.isArray(existingMetadata.peerify)
                    ? { ...(existingMetadata.peerify as Record<string, unknown>) }
                    : {};

            if (values.peerifyArtistIntent) {
                existingPeerify.intent = "artist";
                existingPeerify.artistProfile = normalizePeerifyArtistProfile(values.peerifyArtistProfile);
            } else if ("peerify" in existingMetadata) {
                delete existingPeerify.intent;
                delete existingPeerify.artistProfile;
            }

            if (Object.keys(existingPeerify).length > 0) {
                existingMetadata.peerify = existingPeerify;
            } else {
                delete existingMetadata.peerify;
            }

            circleUpdateData.metadata = existingMetadata;
        } else if (isPeerifyManagedIdentity(existingCircle)) {
            const existingMetadata =
                existingCircle.metadata && typeof existingCircle.metadata === "object" && !Array.isArray(existingCircle.metadata)
                    ? { ...(existingCircle.metadata as Record<string, unknown>) }
                    : {};
            const existingPeerify =
                existingMetadata.peerify && typeof existingMetadata.peerify === "object" && !Array.isArray(existingMetadata.peerify)
                    ? { ...(existingMetadata.peerify as Record<string, unknown>) }
                    : {};

            existingPeerify.managedIdentity = true;
            existingPeerify.identityType = getPeerifyIdentityType(existingCircle);
            existingPeerify.artistProfile = normalizePeerifyArtistProfile(values.peerifyArtistProfile);
            existingMetadata.peerify = existingPeerify;
            circleUpdateData.metadata = existingMetadata;
        }

        // Handle picture upload (keeping existing logic for profile picture)
        if (isFile(values.picture)) {
            // save the picture and get the file info
            circleUpdateData.picture = await saveFile(values.picture, "picture", values._id, true);
            revalidatePath(circleUpdateData.picture.url);
        }

        // --- Handle 'images' array ---
        const finalMediaArray: Media[] = [];
        const finalImageUrls = new Set<string>(); // Keep track of URLs that should remain

        if (values.images) {
            for (const imageItem of values.images) {
                // Check if it's a new file upload using isFile
                if (imageItem.file) {
                    // New file upload
                    try {
                        console.log(`Uploading new image: ${imageItem.file.name}`);
                        const savedFileInfo: FileInfo = await saveFile(imageItem.file, "image", values._id, true);
                        finalMediaArray.push({
                            name: imageItem.file.name,
                            type: imageItem.file.type,
                            fileInfo: savedFileInfo,
                        });
                        finalImageUrls.add(savedFileInfo.url);
                        revalidatePath(savedFileInfo.url);
                        console.log(`Uploaded successfully: ${savedFileInfo.url}`);
                    } catch (uploadError) {
                        console.error("Failed to upload new image:", uploadError);
                        // Optionally return an error or skip this image
                    }
                } else if (imageItem.existingMediaUrl) {
                    // Existing image - find it in the original circle data to preserve metadata
                    const existingMedia = existingCircle.images?.find(
                        (m) => m.fileInfo.url === imageItem.existingMediaUrl,
                    );
                    if (existingMedia) {
                        finalMediaArray.push(existingMedia);
                        finalImageUrls.add(existingMedia.fileInfo.url);
                    } else {
                        // Fallback if not found (should ideally not happen if frontend state is correct)
                        console.warn(`Existing image URL not found in original data: ${imageItem.existingMediaUrl}`);
                        finalMediaArray.push({
                            name: "Existing Image",
                            type: "image/jpeg",
                            fileInfo: { url: imageItem.existingMediaUrl },
                        });
                        finalImageUrls.add(imageItem.existingMediaUrl);
                    }
                }
            }
        }

        // Handle deletion of images removed from the array
        const existingUrls = new Set(existingCircle.images?.map((m) => m.fileInfo.url) || []);
        for (const urlToDelete of existingUrls) {
            if (!finalImageUrls.has(urlToDelete)) {
                try {
                    console.log(`Deleting removed image: ${urlToDelete}`);
                    await deleteFile(urlToDelete); // Assuming deleteFile takes the URL
                    console.log(`Deleted successfully: ${urlToDelete}`);
                    // No need to revalidate path for deleted files usually
                } catch (deleteError) {
                    console.error(`Failed to delete image ${urlToDelete}:`, deleteError);
                    // Decide if this should be a critical error or just logged
                }
            }
        }

        circleUpdateData.images = finalMediaArray;
        // --- End Handle 'images' array ---

        const previousCirclePath = await getCirclePath(existingCircle);

        // update the circle
        await updateCircle(circleUpdateData, userDid);

        // clear page cache
        const updatedCircle = await getCircleById(String(values._id));
        const circlePath = updatedCircle ? await getCirclePath(updatedCircle) : previousCirclePath;
        revalidatePath(previousCirclePath);
        revalidatePath(`${previousCirclePath}settings/about`);
        revalidatePath(circlePath);
        revalidatePath(`${circlePath}settings/about`);

        // Check if handle was updated and return it for potential redirect
        const handleChanged = values.handle && values.handle !== existingCircle.handle;
        const newHandle = handleChanged ? values.handle : undefined;

        return { success: true, message: "Circle about saved successfully", newHandle: newHandle };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle about. " + JSON.stringify(error) };
        }
    }
}
