import { updateCircle } from "@/lib/data/circle";
import { Circle, FormAction, FormSubmitResponse, Page } from "../../../../models/models";
import { revalidatePath } from "next/cache";
import { getServerConfig } from "@/lib/data/server-config";

export const circleAboutFormAction: FormAction = {
    id: "circle-about-form",
    onSubmit: async (values: Record<string, any>, page?: Page): Promise<FormSubmitResponse> => {
        try {
            // console.log("Saving circle settings with values", values);
            // TODO check if user is authorized to save circle settings

            // convert record to circle object
            let circle: Circle = {
                _id: values._id,
                name: values.name,
                handle: values.handle,
            };

            if (values.picture) {
                console.log("Circle picture", values.picture);
            }

            return { success: true, message: "Circle settings saved successfully" };

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
                return { success: false, message: "Failed to save circle settings. " + JSON.stringify(error) };
            }
        }
    },
};
