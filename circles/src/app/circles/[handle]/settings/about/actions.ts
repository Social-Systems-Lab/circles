"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FileInfo, FormSubmitResponse, Media } from "@/models/models"; // Added Media, FileInfo
import { ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { isFile, saveFile, deleteFile } from "@/lib/data/storage"; // Added deleteFile

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
    location?: any;
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
        location: values.location,
    };

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

        // update the circle
        await updateCircle(circleUpdateData, userDid);

        // clear page cache
        let circlePath = await getCirclePath(circleUpdateData);
        revalidatePath(`${circlePath}settings/about`);
        revalidatePath(circlePath); // revalidate home page too

        return { success: true, message: "Circle about saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle about. " + JSON.stringify(error) };
        }
    }
}
