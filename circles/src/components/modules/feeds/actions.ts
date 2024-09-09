"use server";

import { createPost, getFeed, updatePost } from "@/lib/data/feed";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features, feedFeaturePrefix } from "@/lib/data/constants";
import { FileInfo, Media, Post, postSchema } from "@/models/models";

export async function createPostAction(
    formData: FormData,
    isUser: boolean,
): Promise<{ success: boolean; message?: string; post?: Post }> {
    try {
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;
        const feedId = formData.get("feedId") as string;

        // check if the user is authorized to post in the feed
        const userDid = await getAuthenticatedUserDid();
        const feed = await getFeed(feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const feature = feedFeaturePrefix + feed.handle + "_post";
        const authorized = await isAuthorized(userDid, circleId, feature, isUser);
        if (!authorized) {
            return { success: false, message: "You are not authorized to post in this feed" };
        }

        let post: Post = {
            content,
            feedId,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
            //location: TODO implement
        };

        // validate post values
        await postSchema.parseAsync(post);

        // create the post
        let newPost = await createPost(post);

        // handle image uploads
        try {
            const savedMedia: Media[] = [];
            const images = formData.getAll("media") as File[];
            console.log("## image upload", images);
            let imageIndex = 0;
            for (const image of images) {
                if (isFile(image)) {
                    const savedImage = await saveFile(
                        image,
                        `feeds/${feed._id}/${newPost._id}/post-image-${imageIndex}`,
                        circleId,
                        true,
                    );
                    savedMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                    console.log("## saved image", savedImage);
                }
                ++imageIndex;
            }

            if (savedMedia.length > 0) {
                newPost.media = savedMedia;
                await updatePost(newPost);
            }
        } catch (error) {
            console.log("Failed to save post media", error);
        }

        return { success: true, message: "Post created successfully", post: newPost };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create post." };
    }
}
