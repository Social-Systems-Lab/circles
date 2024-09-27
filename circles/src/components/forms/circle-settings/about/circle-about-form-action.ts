import { getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { updateUser } from "@/lib/data/user";

export const circleAboutFormAction: FormAction = {
    id: "circle-about-form",
    onSubmit: async (values: Record<string, any>, page?: Page, subpage?: string): Promise<FormSubmitResponse> => {
        try {
            // console.log("Saving circle settings with values", values);

            let circle: Partial<Circle> = {
                _id: values._id,
                name: values.name,
                handle: values.handle,
                description: values.description,
                isPublic: values.isPublic,
                location: values.location,
                mission: values.mission,
            };

            // check if user is authorized to edit circle settings
            const userDid = await getAuthenticatedUserDid();
            let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
            if (!authorized) {
                return { success: false, message: "You are not authorized to edit circle settings" };
            }

            if (isFile(values.picture)) {
                // save the picture and get the file info
                circle.picture = await saveFile(values.picture, "picture", values._id, true);
                revalidatePath(circle.picture.url);
            }

            if (isFile(values.cover)) {
                // save the cover and get the file info
                circle.cover = await saveFile(values.cover, "cover", values._id, true);
                revalidatePath(circle.cover.url);
            }

            await updateCircle(circle);

            // clear page cache so pages update
            let circlePath = await getCirclePath(circle);
            revalidatePath(circlePath); // revalidate home page
            revalidatePath(`${circlePath}${page?.handle ?? ""}`); // revalidate settings page

            return { success: true, message: "Circle settings saved successfully" };
        } catch (error) {
            if (error instanceof Error) {
                return { success: false, message: error.message };
            } else {
                return { success: false, message: "Failed to save circle settings. " + error };
            }
        }
    },
};
