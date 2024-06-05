import { updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { getServerConfig } from "@/lib/data/server-config";
import { saveFile, isFile } from "@/lib/data/storage";

export const circleAboutFormAction: FormAction = {
    id: "circle-about-form",
    onSubmit: async (values: Record<string, any>, page?: Page): Promise<FormSubmitResponse> => {
        try {
            // console.log("Saving circle settings with values", values);
            // TODO check if user is authorized to save circle settings
            console.log("Calling circleAboutFormAction.onSubmit");

            let circle: Circle = {
                _id: values._id,
                name: values.name,
                handle: values.handle,
            };

            if (isFile(values.picture)) {
                // save the picture and get the file info
                circle.picture = await saveFile(values.picture, "picture", values._id, true);
            }

            if (isFile(values.cover)) {
                // save the cover and get the file info
                circle.cover = await saveFile(values.cover, "cover", values._id, true);
            }

            await updateCircle(circle);

            // clear page cache so pages update
            let serverConfig = await getServerConfig(false);
            if (circle._id === serverConfig.defaultCircleId) {
                revalidatePath(`/`); // root home page
                revalidatePath(`/${page?.handle ? `/${page.handle}` : ""}`); // root settings page
            }
            revalidatePath(`/circles/${circle.handle}${page?.handle ? `/${page.handle}` : ""}`); // settings page
            revalidatePath(`/circles/${circle.handle}`); // home page

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
